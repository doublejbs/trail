# Tracking Save Design

**Date:** 2026-03-22
**Scope:** Sub-project 2 of 3 — Save tracking record to Supabase on stop

## Overview

When the user presses the stop button on the group map page, the completed tracking session (elapsed time, distance, GPS points) is automatically saved to Supabase. The `TrackingStore` handles both tracking state and persistence.

## Architecture

### Database — `tracking_sessions` table

```sql
CREATE TABLE tracking_sessions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id        UUID          NOT NULL REFERENCES groups(id)     ON DELETE CASCADE,
  elapsed_seconds INT           NOT NULL,
  distance_meters NUMERIC(10,2) NOT NULL,
  points          JSONB         NOT NULL,  -- [{ lat: number, lng: number, ts: number }, ...]
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Sub-project 3 리더보드 쿼리용 인덱스
CREATE INDEX ON tracking_sessions (group_id, user_id);

-- RLS
ALTER TABLE tracking_sessions ENABLE ROW LEVEL SECURITY;

-- INSERT: 자신의 기록만 삽입 가능
CREATE POLICY "user can insert own sessions"
  ON tracking_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- SELECT: 같은 그룹 멤버의 기록 조회 가능
-- 재귀 방지: group_members에 대한 RLS는 SECURITY DEFINER 함수로 우회 (기존 is_group_owner 패턴 참고)
CREATE POLICY "group member can view sessions"
  ON tracking_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = tracking_sessions.group_id
        AND gm.user_id  = auth.uid()
    )
  );
```

> **RLS 재귀 주의:** `group_members` 테이블 자체에 RLS가 걸려 있어 서브쿼리가 재귀를 유발할 수 있다. 기존 `20260320000001_fix_rls_recursion.sql`의 해결 방법을 참고해 `SECURITY DEFINER` 함수가 필요하면 마이그레이션에 포함한다.

### TrackingStore changes

**Constructor** gains a `groupId: string` parameter:
```typescript
constructor(private groupId: string) { makeAutoObservable(this); }
```

**New state:**
- `saving: boolean` — true while Supabase INSERT is in flight
- `saveError: string | null` — set if INSERT fails

**`stop()` — fire-and-forget save:**
```typescript
public stop(): void {
  this._clearTimer();
  this.isTracking = false;
  if (this.elapsedSeconds > 0) {   // 빈 세션은 저장 안 함
    void this._save();             // fire-and-forget: stop()은 동기 유지
  }
}
```

**New private async method `_save()`:**
```typescript
private async _save(): Promise<void> {
  this.saving = true;
  this.saveError = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('인증되지 않은 사용자');
    const { error } = await supabase.from('tracking_sessions').insert({
      user_id:         user.id,
      group_id:        this.groupId,
      elapsed_seconds: this.elapsedSeconds,
      distance_meters: this.distanceMeters,
      points:          this.points,
    });
    if (error) throw error;
    runInAction(() => { this.saving = false; });
    toast.success('기록이 저장되었습니다');
  } catch (e) {
    runInAction(() => {
      this.saving = false;
      this.saveError = e instanceof Error ? e.message : '저장 실패';
    });
    toast.error('기록 저장에 실패했습니다');
  }
}
```

`saving = true` 설정은 `_save()` 진입 시 동기 처리 — `runInAction` 불필요 (public 액션 컨텍스트 내부가 아닌 private async 이므로 **필요**: `this.saving = true`도 `runInAction`으로 감쌀 것).

**Corrected `_save()` state management:**

```typescript
private async _save(): Promise<void> {
  runInAction(() => { this.saving = true; this.saveError = null; });
  try {
    // ... supabase calls ...
    runInAction(() => { this.saving = false; });
    toast.success('기록이 저장되었습니다');
  } catch (e) {
    runInAction(() => {
      this.saving = false;
      this.saveError = e instanceof Error ? e.message : '저장 실패';
    });
    toast.error('기록 저장에 실패했습니다');
  }
}
```

**`dispose()` change:** no change needed — `_save()` is fire-and-forget, dispose does not await it.

### GroupMapPage changes

- `TrackingStore` instantiated with group id: `new TrackingStore(id!)`
- Stats panel rendering condition: `trackingStore.isTracking || trackingStore.saving` — keep panel visible while saving so the stop button doesn't abruptly disappear
- Stop button is disabled while `trackingStore.saving` is true

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

**While `saving === true`:**
- Stats panel stays visible (`isTracking || saving`)
- Stop button shows disabled state (`disabled`, muted style)
- No spinner needed — INSERT is fast

**On error:** `toast.error` (sonner) — no inline error UI

## Files

| File | Change |
|------|--------|
| `supabase/migrations/20260322000001_tracking_sessions.sql` | New migration — table + RLS + index |
| `src/types/trackingSession.ts` | New file — TypeScript interface |
| `src/stores/TrackingStore.ts` | Add `groupId` constructor param, `saving`/`saveError` state, `_save()`, update `stop()` |
| `src/stores/TrackingStore.test.ts` | All existing `new TrackingStore()` calls → `new TrackingStore('test-group-id')`; add tests: save on stop, skip save when elapsedSeconds=0, save error handling |
| `src/pages/GroupMapPage.tsx` | Pass `id!` to `TrackingStore` constructor; update panel condition to `isTracking \|\| saving`; disable stop button while saving |
| `src/pages/GroupMapPage.test.tsx` | Add `saving: false` to `mockTrackingStore`; add test: panel visible while saving, stop button disabled while saving |

## Error Handling

- `getUser()` returns `null` user (no error): treated as auth error, save skipped, `toast.error`
- Supabase INSERT failure: `saveError` set, `toast.error` shown, `saving` cleared
- `elapsedSeconds === 0`: save skipped silently (no toast)
- Component unmounts during save: `_save()` may still complete in background (acceptable — INSERT is idempotent enough for this use case)

## Out of Scope

- Leaderboard / history page (Sub-project 3)
- Editing or deleting records
- Offline / retry queue
- Deduplication of rapid stop→start→stop cycles
- Pause/resume tracking
