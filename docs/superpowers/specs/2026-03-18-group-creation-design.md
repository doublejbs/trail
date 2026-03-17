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

`load()` sets `loading = true`, queries Supabase, sets `groups` on success or `error = true` on failure.

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
  async submit(userId: string): Promise<string | null>
}
```

`submit`:
1. Upload `file` to `gpx-files/{userId}/{uuid}.gpx`
2. Insert row into `groups` (name, created_by, gpx_path)
3. Return new group `id` on success, set `error` and return `null` on failure

### `MapStore` additions (`src/stores/MapStore.ts`)

Add GPX polyline support:

```ts
// New observables
gpxPolyline: naver.maps.Polyline | null = null  // observable.ref

// New methods
drawGpxRoute(gpxText: string): void
  // 1. Parse gpxText with DOMParser
  // 2. Extract <trkpt lat lon> elements
  // 3. If no points found, set error = true and return
  // 4. Create naver.maps.Polyline with extracted LatLng array
  // 5. Set map center to first trackpoint
  // 6. Store polyline in gpxPolyline

clearGpxRoute(): void
  // Remove polyline from map, set gpxPolyline = null

// Update destroy() to also call clearGpxRoute()
```

GPX parsing uses browser-native `DOMParser` — no additional npm dependency.

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
4. After `store.initMap(el)` succeeds (`store.map` is set), call `store.drawGpxRoute(gpxText)`
5. Clean up: `store.clearGpxRoute()` is called inside `store.destroy()`

Loading state: spinner overlay while fetching group + GPX.

## Routing

Add to `App.tsx` (nested under `path="/"`):

```tsx
<Route path="group/new" element={<GroupCreatePage />} />
```

## Changed Files

| File | Change |
|---|---|
| `src/types/group.ts` | New — `Group` interface |
| `src/stores/GroupStore.ts` | New — list fetch |
| `src/stores/GroupCreateStore.ts` | New — create form + upload |
| `src/stores/MapStore.ts` | Add `gpxPolyline`, `drawGpxRoute`, `clearGpxRoute`; update `destroy` |
| `src/pages/GroupPage.tsx` | Replace dummy data with GroupStore, add FAB |
| `src/pages/GroupCreatePage.tsx` | New — create form UI |
| `src/pages/GroupMapPage.tsx` | Replace dummy lookup with Supabase fetch + drawGpxRoute |
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

## Known Limitations

- Orphaned GPX files if DB insert fails after upload (deferred cleanup)
- Signed URL expires after 60 minutes; page reload required after expiry (acceptable for now)
