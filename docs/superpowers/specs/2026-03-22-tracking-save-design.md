# Tracking Save Design

**Date:** 2026-03-22
**Scope:** Sub-project 2 of 3 — Save tracking record to Supabase on stop

## Overview

When the user presses the stop button on the group map page, the completed tracking session (elapsed time, distance, GPS points) is automatically saved to Supabase. The `TrackingStore` handles both tracking state and persistence.

## Architecture

### Database — `tracking_sessions` table

```sql
CREATE TABLE tracking_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id      UUID        NOT NULL REFERENCES groups(id)     ON DELETE CASCADE,
  elapsed_seconds INT       NOT NULL,
  distance_meters NUMERIC(10, 2) NOT NULL,
  points        JSONB       NOT NULL,   -- [{ lat: number, lng: number, ts: number }, ...]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS policies:**
- `SELECT`: user must be a member of the session's `group_id` (via `group_members` table)
- `INSERT`: `user_id = auth.uid()` — users can only insert their own records
- No UPDATE or DELETE policies (records are immutable)

**Index:** `(group_id, user_id)` for Sub-project 3 leaderboard queries.

### TrackingStore changes

**Constructor** gains a `groupId: string` parameter:
```typescript
constructor(private groupId: string) { makeAutoObservable(this); }
```

**New state:**
- `saving: boolean` — true while Supabase INSERT is in flight
- `saveError: string | null` — set if INSERT fails

**`stop()` change:** calls `this._save()` after setting `isTracking = false`

**New private method `_save()`:**
```
async _save():
  set saving = true, saveError = null
  get current user from supabase.auth.getUser()
  INSERT into tracking_sessions: { user_id, group_id, elapsed_seconds, distance_meters, points }
  on success: toast.success('기록이 저장되었습니다')
  on error:   set saveError = error.message, toast.error('기록 저장에 실패했습니다')
  finally:    set saving = false
```

State changes after async calls are wrapped in `runInAction()`.

**`dispose()` change:** if `saving` is true at dispose time, saving is abandoned (no await — component is unmounting).

### GroupMapPage changes

- `TrackingStore` instantiated with group id: `new TrackingStore(id!)`
- No other changes to the page

### TypeScript type

Add `src/types/trackingSession.ts`:
```typescript
export interface TrackingSession {
  id: string;
  user_id: string;
  group_id: string;
  elapsed_seconds: number;
  distance_meters: number;
  points: { lat: number; lng: number; ts: number }[];
  created_at: string;
}
```

## UI

- While `saving === true`: 중지 버튼 자리에 작은 로딩 스피너 표시 (optional — saving is fast enough that a spinner may not be needed; implement as simple disabled state on stop button)
- On error: `toast.error` (sonner) — no inline error UI needed

## Files

| File | Change |
|------|--------|
| `supabase/migrations/20260322000001_tracking_sessions.sql` | New migration — table + RLS + index |
| `src/types/trackingSession.ts` | New file — TypeScript interface |
| `src/stores/TrackingStore.ts` | Add `groupId` constructor param, `saving`/`saveError` state, `_save()`, update `stop()` |
| `src/stores/TrackingStore.test.ts` | Add tests for save flow |
| `src/pages/GroupMapPage.tsx` | Pass `id!` to `TrackingStore` constructor |
| `src/pages/GroupMapPage.test.tsx` | Update mock to include `groupId`, add saving state tests |

## Error Handling

- Supabase INSERT failure: `saveError` set, `toast.error` shown, `saving` cleared
- User not authenticated at save time: treated as error (same path)
- Component unmounts during save: `dispose()` is called but save is not awaited — the INSERT may still complete in the background (acceptable)

## Out of Scope

- Leaderboard / history page (Sub-project 3)
- Editing or deleting records
- Offline / retry queue
- Deduplication of rapid stop→start→stop cycles
