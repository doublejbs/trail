# Group Map Design

**Date:** 2026-03-17

## Overview

Remove the standalone map tab and `MapPage` entirely. Users access the map only by selecting a group from the group tab. The map view shows the existing Naver map (centered on the user's location).

## Routing Structure

`/group/:id` is a nested child under the same `path="/"` parent route (inside `ProtectedRoute` and `MainLayout`):

```tsx
<Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
  <Route index element={<Navigate to="/group" replace />} />
  <Route path="group" element={<GroupPage />} />
  <Route path="group/:id" element={<GroupMapPage />} />
  <Route path="history" element={<HistoryPage />} />
  <Route path="profile" element={<ProfilePage />} />
</Route>
```

`MapPage` is no longer used as a standalone route and its file is deleted. `GroupMapPage` contains the map logic directly (copied from `MapPage`) rather than nesting `<MapPage />` — this avoids a lifecycle conflict caused by `MapStore.destroy()` being called on unmount and Naver Maps SDK not reliably tolerating re-initialisation of the same DOM element.

The BottomTabBar `isActive` check for the group tab uses `startsWith('/group')`, so it remains highlighted at `/group/:id` with no changes needed. After removing the `/` tab entry, simplify `isActive` to a single line:

```ts
function isActive(tabPath: string, currentPath: string): boolean {
  return currentPath.startsWith(tabPath);
}
```

This is safe because no remaining tab path is `'/'` (which would match every route with `startsWith`), and no tab path is a prefix of another.

## Shared Dummy Data

Create `src/data/groups.ts`:

```ts
export interface Group {
  id: number;
  name: string;
}

export const DUMMY_GROUPS: Group[] = [
  { id: 0, name: '한라산 팀' },
  { id: 1, name: '설악산 팀' },
  { id: 2, name: '지리산 팀' },
  { id: 3, name: '북한산 팀' },
  { id: 4, name: '태백산 팀' },
];
```

Both `GroupPage` and `GroupMapPage` import from this file. The `:id` URL parameter is the group's `id` field. Use `DUMMY_GROUPS.find(g => g.id === Number(id))` rather than array indexing — this avoids silent bugs if ids and indices diverge in the future.

## Screens

### GroupPage (`/group`)

- Root div: replace existing `flex h-full flex-col items-center justify-center gap-4 bg-white` with `h-full overflow-y-auto bg-black` (removes centering, adds scroll, dark background)
- Renders a list of rows using `DUMMY_GROUPS`. Each row example:
  ```tsx
  <button
    key={group.id}
    onClick={() => navigate(`/group/${group.id}`)}
    className="w-full px-4 py-4 text-left text-white border-b border-neutral-800 active:bg-neutral-800"
  >
    {group.name}
  </button>
  ```

### GroupMapPage (`/group/:id`)

Contains the full map logic from the current `MapPage` (MapStore, initMap, locate button) plus a back button overlay. Do not nest `<MapPage />`; copy the map div + useEffect pattern directly. Wrap the component with `observer()` from `mobx-react-lite` — identical to `MapPage` — so `store.map` and `store.error` trigger re-renders.

**Hook ordering** — all hooks must be called unconditionally before any early return (Rules of Hooks). Declare `useParams`, `useNavigate`, `useRef`, `useState`, and `useEffect` first; guard inside `useEffect` if the group is undefined; then do the early return guard after all hooks:

```tsx
const { id } = useParams();
const navigate = useNavigate();
const mapRef = useRef<HTMLDivElement>(null);
const [store] = useState(() => new MapStore());
const group = DUMMY_GROUPS.find(g => g.id === Number(id));

useEffect(() => {
  if (!mapRef.current || !group) return;
  store.initMap(mapRef.current);
  return () => store.destroy();
}, [store]);
// group is intentionally excluded from the dep array to avoid re-triggering
// initMap/destroy on re-renders. The !group check inside the effect is a
// defensive guard: useEffect runs after paint, and <Navigate> in the return
// redirects on the next commit, so the effect may run once with group
// undefined before the redirect is flushed.

if (!group) return <Navigate to="/group" replace />;
```

`Number(undefined)` is `NaN`; `find` returns `undefined` for `NaN`. Float strings like `'3.7'` produce `3.7` via `Number()`, which does not match any integer `id` in `find`, so it returns `undefined`. The `if (!group)` check covers all invalid cases.

**DOM structure:**

```
<div className="absolute inset-0">
  <div
    ref={mapRef}
    data-testid="map-container"
    className="absolute inset-0 w-full h-full"
  />
  {store.error && <error overlay />}
  {store.map && <locate button />}
  <div className="absolute top-4 left-4">
    <button
      onClick={() => navigate('/group')}
      className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
    >
      ← {group.name}
    </button>
  </div>
</div>
```

Back button calls `navigate('/group')` (not `navigate(-1)`) for predictable behaviour regardless of navigation history.

## Testing

### `BottomTabBar.test.tsx`
Rewrite the entire file for 3 tabs (그룹, 기록, 프로필). Delete all 5 existing tests, which all reference `'지도'`. New tests:
- Renders 3 tabs: 그룹, 기록, 프로필
- `/group` path activates 그룹 tab
- `/group/0` path activates 그룹 tab (startsWith check)
- Tab click calls `navigate` with the correct path

### `GroupMapPage.test.tsx` (new)
Before deleting `MapPage.test.tsx`, study its `vi.hoisted` + constructor mock pattern for `MapStore` — `GroupMapPage.test.tsx` uses the same approach. `MapPage.test.tsx` does not mock `window.naver`; `MapStore` is fully mocked so no Naver SDK stub is needed in the component test.

Minimum test cases:
- Invalid id (e.g. `id="99"`) redirects to `/group`
- Non-numeric id (e.g. `id="abc"`) redirects to `/group`
- Valid id renders `data-testid="map-container"`
- Valid id renders the group name in the back button
- Back button click calls `navigate('/group')`
- (Optional) Unmounting calls `store.destroy()`
- (Optional) Valid id calls `store.initMap` with the map container element

## Changed Files

| File | Change |
|---|---|
| `src/data/groups.ts` | New — shared dummy group data |
| `src/components/BottomTabBar.tsx` | Remove `/` tab entry; remove dead `isActive('/')` guard; remove `Map` import from `lucide-react` |
| `src/components/BottomTabBar.test.tsx` | Rewrite for 3 tabs (see Testing section) |
| `src/App.tsx` | Replace index route with redirect; add `group/:id` route; remove `MapPage` import |
| `src/pages/GroupPage.tsx` | Replace placeholder with group list using `DUMMY_GROUPS` |
| `src/pages/GroupMapPage.tsx` | New — full map logic (from MapPage) + back button overlay |
| `src/pages/GroupMapPage.test.tsx` | New — test cases listed above |
| `src/pages/MapPage.tsx` | Delete |
| `src/pages/MapPage.test.tsx` | Delete (study mock pattern first) |

## Navigation Flow

```
/ → redirect → /group
그룹 탭 → GroupPage (list)
  └─ tap group → GroupMapPage (map + back button)
       └─ tap back (navigate('/group')) → GroupPage (list)
```

## Known Limitations

- `MapStore.destroy()` resets `map` to `null` but does not reset `error`. Since `GroupMapPage` creates a fresh `MapStore` per mount (via `useState`), and React Router v6 fully unmounts `GroupMapPage` when navigating back to `/group`, stale `error` state is never carried across group navigations. Resetting `error` in `destroy()` is deferred.

## Out of Scope

- Real group data from Supabase
- Showing group members' locations on the map
- Group creation / management
- iOS safe-area inset for the back button (`env(safe-area-inset-top)`)
