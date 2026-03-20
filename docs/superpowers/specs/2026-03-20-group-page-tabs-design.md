# GroupPage Tabs Design

**Date:** 2026-03-20
**Status:** Approved

---

## Overview

Add a tab bar to `GroupPage` to separate owned groups from joined groups. No new API calls — client-side filtering of the existing `store.groups` array.

---

## UI

- Two tabs pinned at the top of the page:
  - **내가 만든 그룹** (first, default)
  - **참여중인 그룹**
- Active tab: bottom border indicator (`border-b-2 border-black`)
- Inactive tab: no border, muted text
- The FAB (+ 버튼) is always visible regardless of active tab

---

## Filtering Logic

```
내가 만든 그룹  → store.groups.filter(g => g.created_by === store.currentUserId)
참여중인 그룹  → store.groups.filter(g => g.created_by !== store.currentUserId)
```

`store.currentUserId` is already exposed by `GroupStore` (added in the group invite feature).

---

## Empty States

| Tab | Message |
|-----|---------|
| 내가 만든 그룹 | 아직 만든 그룹이 없습니다 |
| 참여중인 그룹 | 아직 참여한 그룹이 없습니다 |

---

## Changes

### Removed
- 소유자/멤버 badges — tabs make them redundant

### Modified
- `src/pages/GroupPage.tsx` — add tab state, filtering, tab UI, update empty state messages
- `src/pages/GroupPage.test.tsx` — update tests for tab behaviour

---

## Out of Scope

- Persisting active tab across navigation
- Tab-specific create flow
- Group count badges on tabs
