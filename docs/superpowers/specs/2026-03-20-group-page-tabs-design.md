# GroupPage Tabs Design

**Date:** 2026-03-20
**Status:** Approved

---

## Overview

Add a tab bar to `GroupPage` to separate owned groups from joined groups. No new API calls — client-side filtering of the existing `store.groups` array.

---

## UI

- Two tabs pinned at the top of the page:
  - **내가 만든 그룹** (first, default active)
  - **참여중인 그룹**
- Active tab: bottom border indicator (`border-b-2 border-black`)
- Inactive tab: no border, muted text
- Tab bar is always shown (even when both tabs are empty)
- The FAB (+ 버튼) is always visible regardless of active tab

---

## Tab State

```typescript
const [activeTab, setActiveTab] = useState<'owned' | 'joined'>('owned');
```

---

## Filtering Logic

```
내가 만든 그룹  → store.groups.filter(g => g.created_by === store.currentUserId)
참여중인 그룹  → store.groups.filter(g => g.created_by !== store.currentUserId)
```

`store.currentUserId` is set in the same `runInAction` as `store.groups`, so it is always resolved together after `load()` completes.

**`currentUserId` null edge case:** If `getUser()` fails independently (auth error), `currentUserId` stays `null`. In this case "내가 만든 그룹" is empty (correct — ownership cannot be determined), and "참여중인 그룹" shows all groups. This is an acceptable degraded state for an auth error.

---

## Empty States

The global empty check (`store.groups.length === 0`) is removed. Instead, each tab independently shows its own empty message:

| Tab | Message |
|-----|---------|
| 내가 만든 그룹 | 아직 만든 그룹이 없습니다 |
| 참여중인 그룹 | 아직 참여한 그룹이 없습니다 |

---

## Changes

### Removed
- 소유자/멤버 badges — tabs make them redundant
- Global empty state (`store.groups.length === 0` check)

### Modified
- `src/pages/GroupPage.tsx` — add `activeTab` state, filtering, tab UI, per-tab empty state
- `src/pages/GroupPage.test.tsx` — **delete** existing badge tests (`소유자 그룹에 소유자 배지 표시`, `멤버 그룹에 멤버 배지 표시`); replace with tab behaviour tests

### New tests
- 기본 탭은 "내가 만든 그룹"
- "내가 만든 그룹" 탭: `created_by === currentUserId` 그룹만 표시
- "참여중인 그룹" 탭: `created_by !== currentUserId` 그룹만 표시
- 빈 탭: 탭별 empty 메시지 표시

---

## Out of Scope

- Persisting active tab across navigation
- Group count badges on tabs
- Tab-specific create flow
