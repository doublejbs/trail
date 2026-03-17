# Group Map Design

**Date:** 2026-03-17

## Overview

Remove the standalone map tab. Instead, users access the map by selecting a group from the group tab. The map view shows the existing Naver map (centered on the user's location).

## Routing Structure

```
/group          → GroupPage (group list)
/group/:id      → GroupMapPage (map view)
```

The BottomTabBar `isActive` for the group tab already uses `startsWith('/group')`, so it remains highlighted at `/group/:id` with no changes needed.

## Screens

### GroupPage (`/group`)
- Renders a scrollable list of dummy groups (name only)
- Dummy data: ["한라산 팀", "설악산 팀", "지리산 팀", "북한산 팀", "태백산 팀"]
- Each item is a tappable row that navigates to `/group/:id` (id = index or slug)
- Placeholder for future Supabase integration

### GroupMapPage (`/group/:id`)
- Renders the existing `MapPage` component (full-screen Naver map)
- Overlays a back button (top-left, absolute positioned) that navigates back to `/group`
- The group name can be displayed in the back button area for context (e.g., "← 한라산 팀")

## Changed Files

| File | Change |
|---|---|
| `src/components/BottomTabBar.tsx` | Remove map tab (`/` entry) from TABS array |
| `src/App.tsx` | Add `/group/:id` route; remove the `/` (map) index route |
| `src/pages/GroupPage.tsx` | Replace placeholder with dummy group list UI |
| `src/pages/GroupMapPage.tsx` | New file — renders MapPage + back button overlay |

## Navigation Flow

```
그룹 탭 → GroupPage (list)
  └─ tap group → GroupMapPage (map + back button)
       └─ tap back → GroupPage (list)
```

## Out of Scope

- Real group data from Supabase
- Showing group members' locations on the map
- Group creation / management
