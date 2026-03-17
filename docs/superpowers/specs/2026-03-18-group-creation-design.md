# Group Creation Design

**Date:** 2026-03-18

## Overview

Replace dummy group data with real Supabase-backed groups. Users can create groups with a name and a GPX file. The group map view fetches the GPX from Storage and draws the route as a polyline via `MapStore`.

## Scope

- Supabase `groups` table + `gpx-files` Storage bucket
- `GroupPage`: list my groups, navigate to create/map
- `GroupCreatePage` (`/group/new`): form with group name + GPX upload
- `GroupMapPage`: fetch group from Supabase, draw GPX polyline via `MapStore`
- `MapStore`: add GPX parsing + polyline drawing
- Delete `src/data/groups.ts`

**Out of scope (deferred):** group invites, member management, shared groups.

## Database Schema

Run in Supabase SQL editor:

```sql
create table groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references auth.users(id),
  gpx_path   text not null,
  created_at timestamptz default now()
);

alter table groups enable row level security;

create policy "owner select"
  on groups for select
  using (auth.uid() = created_by);

create policy "owner insert"
  on groups for insert
  with check (auth.uid() = created_by);
```

No delete policy is intentional — group deletion is out of scope for this feature.

## Storage

- Bucket name: `gpx-files` (private, no public access)
- Object path: `{user_id}/{group_id}.gpx`
- RLS on `storage.objects`:

```sql
create policy "owner upload"
  on storage.objects for insert
  with check (bucket_id = 'gpx-files' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "owner read"
  on storage.objects for select
  using (bucket_id = 'gpx-files' and auth.uid()::text = (storage.foldername(name))[1]);
```

GPX files are accessed via Signed URLs (60-minute expiry) generated at read time.

## TypeScript Types

Create `src/types/group.ts`:

```ts
export interface Group {
  id: string;
  name: string;
  created_by: string;
  gpx_path: string;
  created_at: string;
}
```

## Stores

### `GroupStore` (`src/stores/GroupStore.ts`)

Responsibilities: fetch the current user's group list from Supabase.

```ts
class GroupStore {
  groups: Group[] = [];
  loading: boolean = true;
  error: boolean = false;

  async load(): Promise<void>  // fetch groups where created_by = auth.uid()
}
```

`load()` sets `loading = true` at the start, queries Supabase, then on success sets `groups` and sets `loading = false`; on failure sets `error = true` and sets `loading = false`. Both paths always reset `loading` to `false`. The initial value of `loading: true` is intentional — it keeps `GroupPage` in spinner state until the first `load()` call completes.

`GroupPage` calls `GroupStore.load()` every time it mounts. Since React Router v6 fully unmounts `GroupPage` when navigating to a child route and remounts it on return, a fresh `load()` is always triggered — the new group will be visible after returning from `GroupCreatePage` without any additional cache invalidation.

**Error type note:** `GroupStore.error` is `boolean` (fetch either worked or it didn't). `GroupCreateStore.error` is `string | null` to surface specific upload/insert failure messages to the user.

### `GroupCreateStore` (`src/stores/GroupCreateStore.ts`)

Responsibilities: hold form state and orchestrate GPX upload + DB insert.

```ts
class GroupCreateStore {
  name: string = '';
  file: File | null = null;
  submitting: boolean = false;
  error: string | null = null;

  setName(v: string): void
  setFile(f: File | null): void
  get isValid(): boolean  // name.trim() !== '' && file !== null

  // Returns new group id on success, null on failure
  async submit(): Promise<string | null>
}
```

`submit()` takes no arguments — it calls `supabase.auth.getUser()` internally to obtain `userId`. This keeps the caller free from auth concerns.

`submit` steps:
1. Call `supabase.auth.getUser()` to get `userId`. On failure, set `error` and return `null`.
2. Generate a UUID for the new group: `const groupId = crypto.randomUUID()`.
3. Upload `file` to `gpx-files/{userId}/{groupId}.gpx` using the pre-generated `groupId`.
4. Insert row into `groups` with `id: groupId`, `name`, `created_by: userId`, `gpx_path: '{userId}/{groupId}.gpx'`.
5. Return `groupId` on success; set `error` and return `null` on any failure.

Using `crypto.randomUUID()` before the upload means the same UUID is used for both the Storage path and the DB row `id`, guaranteeing they match without a second round-trip.

### `MapStore` additions (`src/stores/MapStore.ts`)

Add GPX polyline support:

```ts
// New observables
gpxPolyline: naver.maps.Polyline | null = null  // declared observable.ref in makeAutoObservable options, same as map

// New methods
drawGpxRoute(gpxText: string): void
  // 1. Parse gpxText with DOMParser
  // 2. Extract <trkpt lat lon> elements
  // 3. If no points found, set error = true and return
  // 4. Create naver.maps.Polyline with extracted LatLng array, set map to this.map
  // 5. Set map center to first trackpoint (zoom level unchanged)
  // 6. Store polyline in gpxPolyline

clearGpxRoute(): void
  // Remove polyline from map (polyline.setMap(null)), set gpxPolyline = null

// Update destroy() to also call clearGpxRoute()
// Callers should always use destroy() for cleanup — never call clearGpxRoute() directly on unmount
```

GPX parsing uses browser-native `DOMParser` — no additional npm dependency.

**Camera behavior:** `drawGpxRoute` pans to the first trackpoint via `this.map.setCenter(firstLatLng)` but does not change the zoom level. This gives a predictable experience without guessing an appropriate zoom for arbitrary GPX files.

## Screens

### `GroupPage` (`/group`)

- On mount: call `GroupStore.load()`
- Loading state: spinner
- Error state: "그룹을 불러올 수 없습니다" message
- Empty state: "아직 그룹이 없습니다" message
- List: each row shows `group.name`, taps to `/group/{id}`
- FAB (`+`) bottom-right → navigate to `/group/new`

### `GroupCreatePage` (`/group/new`)

Layout: full-screen dark page with back button, form below.

- Back button (top-left) → `/group`
- Group name: text input
- GPX file: file input accepting `.gpx` only, shows selected filename or "파일 선택"
- Submit button: disabled while `!isValid || submitting`, shows spinner while submitting
- On success: navigate to `/group`
- On error: `toast.error(store.error)`

### `GroupMapPage` (`/group/:id`)

Changes from current implementation:

1. **Fetch group** from Supabase by id (where `created_by = auth.uid()`). If not found → `<Navigate to="/group" replace />`
2. **Generate Signed URL** for `group.gpx_path`
3. **Fetch GPX text** from Signed URL

**Loading state:** Use a local `useState<boolean>` (`gpxLoading`) within `GroupMapPage`. Show a full-screen spinner overlay while `gpxLoading` is true (i.e., from effect start until fetch completes or fails). This is separate from `MapStore.error`, which covers map SDK and GPX parse failures.

**Async coordination and dependency array:** The Supabase fetch and GPX download happen in a single `useEffect` that also calls `store.initMap(el)`. `initMap` is synchronous — it initialises the Naver SDK immediately. After `initMap` returns, `store.map` is set and `drawGpxRoute` can be called safely. The effect uses `[store]` as its dependency array; `id` from `useParams` is intentionally excluded (same reasoning as the current `group` exclusion — re-running `initMap`/`destroy` on `id` changes would break the Naver Maps SDK lifecycle). Each group map view mounts a fresh `GroupMapPage` instance via React Router, so stale `id` is not a concern.

```ts
const [gpxLoading, setGpxLoading] = useState(true);

useEffect(() => {
  if (!mapRef.current) return;
  store.initMap(mapRef.current);
  if (store.error) { setGpxLoading(false); return; }

  let cancelled = false;
  (async () => {
    // 1. Fetch group from Supabase by id
    // 2. If not found: navigate to /group, return
    // 3. Generate signed URL for group.gpx_path
    // 4. Fetch GPX text from signed URL
    // 5. if (!cancelled) store.drawGpxRoute(gpxText)
    if (!cancelled) setGpxLoading(false);
  })();

  return () => {
    cancelled = true;
    store.destroy();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [store]);
```

The `cancelled` flag prevents a state update on an already-unmounted component.

4. After `store.initMap(el)` succeeds (`store.map` is set), call `store.drawGpxRoute(gpxText)`
5. Clean up: `store.clearGpxRoute()` is called inside `store.destroy()`

Back button navigates to `/group` (not `navigate(-1)`) for predictable behavior regardless of navigation history depth.

## Routing

Full route tree in `App.tsx` (all group routes are nested under the `ProtectedRoute`/`MainLayout` parent):

```tsx
<Route
  path="/"
  element={
    <ProtectedRoute>
      <MainLayout />
    </ProtectedRoute>
  }
>
  <Route index element={<Navigate to="/group" replace />} />
  <Route path="group" element={<GroupPage />} />
  <Route path="group/new" element={<GroupCreatePage />} />
  <Route path="group/:id" element={<GroupMapPage />} />
  <Route path="history" element={<HistoryPage />} />
  <Route path="profile" element={<ProfilePage />} />
</Route>
```

React Router v6 scores static segments higher than dynamic ones, so `group/new` beats `group/:id` regardless of order. The static route is listed first for clarity.

## Testing Notes

- `GroupMapPage.test.tsx` currently tests against `DUMMY_GROUPS` and mocks nothing Supabase-related. After this feature, `GroupMapPage` fetches from Supabase — the test file must be rewritten to mock Supabase calls. Plan for this in the implementation.
- `GroupStore` and `GroupCreateStore` can be tested by mocking the `supabase` client.
- `MapStore.drawGpxRoute` / `clearGpxRoute` can be tested by passing GPX XML strings directly (no network needed).

## Changed Files

| File | Change |
|---|---|
| `src/types/group.ts` | New — `Group` interface |
| `src/stores/GroupStore.ts` | New — list fetch |
| `src/stores/GroupCreateStore.ts` | New — create form + upload |
| `src/stores/MapStore.ts` | Add `gpxPolyline`, `drawGpxRoute`, `clearGpxRoute`; update `destroy` |
| `src/pages/GroupPage.tsx` | Replace dummy data with GroupStore, add FAB |
| `src/pages/GroupCreatePage.tsx` | New — create form UI |
| `src/pages/GroupMapPage.tsx` | Replace dummy lookup with Supabase fetch + drawGpxRoute; rewrite tests |
| `src/App.tsx` | Add `group/new` route |
| `src/data/groups.ts` | Delete |

## Error Handling

| Scenario | Behaviour |
|---|---|
| Group list fetch fails | `error = true`, show error message in GroupPage |
| GPX upload fails | `GroupCreateStore.error` set, toast shown |
| DB insert fails after upload | Show toast error; GPX file left in Storage (acceptable for now) |
| Group not found in map view | `<Navigate to="/group" replace />` |
| GPX fetch fails in map view | `MapStore.error = true`, show existing error overlay |
| GPX has no trackpoints | `MapStore.error = true`, show existing error overlay |
| Signed URL expired (60 min) | `MapStore.error = true`, same error overlay shown; user must reload the page |

## Known Limitations

- Orphaned GPX files if DB insert fails after upload (deferred cleanup)
- Signed URL expires after 60 minutes; the existing map error overlay is shown on expiry — user must reload the page (acceptable for now)
