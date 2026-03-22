# Leaderboard Design

**Date:** 2026-03-22
**Scope:** Sub-project 3 of 3 — Group activity period management + real-time route-progress leaderboard

## Overview

Group admins start and end an activity period from the group map page. During the period, participants track their route and their furthest point along the GPX course is broadcast live (1-second updates via Supabase Realtime). The group map page gains a chip tab (지도 / 순위) to switch between the map and the leaderboard. The leaderboard merges live broadcast data with persisted session data to show real-time rankings.

## Architecture

### DB Schema

**New table: `profiles`**
```sql
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 본인 row만 INSERT (id = auth.uid() 강제)
CREATE POLICY "user can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- 본인 row만 UPDATE
CREATE POLICY "user can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- 인증된 사용자는 모든 profile SELECT 가능
CREATE POLICY "authenticated users can view profiles"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);
```

**Alter `groups`** — activity period columns:
```sql
ALTER TABLE groups
  ADD COLUMN period_started_at TIMESTAMPTZ,
  ADD COLUMN period_ended_at   TIMESTAMPTZ;
```
- `period_started_at IS NOT NULL AND period_ended_at IS NULL` → period is active
- Admin (created_by) sets these via `startPeriod()` / `endPeriod()` actions
- 기존 `groups` RLS 정책이 `created_by = auth.uid()`인 경우에만 UPDATE를 허용하므로 별도 정책 추가 불필요. 기존 정책이 새 컬럼에도 적용된다.

**Alter `tracking_sessions`** — route progress column:
```sql
ALTER TABLE tracking_sessions
  ADD COLUMN max_route_meters NUMERIC(10,2);
```
Written once at session stop. Null for sessions recorded before this migration.

### Route Projection — `src/utils/routeProjection.ts`

Two exported functions:

```typescript
// Parse GPX XML string → ordered lat/lng waypoint array
export function parseGpxPoints(gpxText: string): { lat: number; lng: number }[]

// Given GPS tracking points and route waypoints,
// return the furthest distance (meters) reached along the route.
// Returns 0 if either array is empty.
export function maxRouteProgress(
  trackingPoints: { lat: number; lng: number }[],
  routePoints:    { lat: number; lng: number }[]
): number
```

**Projection algorithm (step-by-step):**

`t` 계산은 위도/경도 degree 단위 벡터 연산으로 수행한다 (소규모 지역에서 오차 허용). 거리 누적은 haversine meters로 수행한다.

For each tracking point `P`:
1. Iterate every consecutive route segment `(A, B)`.
2. Compute the projection parameter `t` in degree space:
   - `t = clamp(dot(P-A, B-A) / dot(B-A, B-A), 0, 1)`
   - where vectors are treated as 2D `(lat, lng)` floats
3. Compute distance from `P` to projected point `Q = A + t*(B-A)` (haversine). Track segment index `i` and `t` of minimum distance.
4. Compute cumulative route distance up to `Q`:
   - Sum `haversineMeters(segment[k], segment[k+1])` for `k = 0..i-1`
   - Add `t * haversineMeters(A, B)`
5. Record `progressForP = cumulative distance`.

After all tracking points: return `max(progressForP)`.

Uses the same `haversineMeters` helper already in `TrackingStore.ts` (move to a shared util or duplicate).

### TrackingStore changes

Constructor gains `routePoints` parameter:
```typescript
constructor(private groupId: string, private routePoints: { lat: number; lng: number }[])
```

New private fields:
- `private _userId: string | null = null`
- `private _displayName: string | null = null`
- `private _channel: ReturnType<typeof supabase.channel> | null = null`

New public method:
- `setRoutePoints(points: { lat: number; lng: number }[]): void` — GPX 로드 완료 후 GroupMapPage에서 호출해 routePoints 주입. `this.routePoints = points`로 교체.

New public state:
- `maxRouteMeters: number = 0` (updated in `addPoint()`)

**`start()` 초기화 순서:**
1. 기존 동기 로직 (타이머 초기화, `isTracking = true`, `setInterval` 시작) 먼저 실행 — 변경 없음.
2. `void this._initBroadcast()` 로 fire-and-forget 비동기 초기화 시작.

**새 private 메서드 `_initBroadcast()`:**
`_userId`, `_displayName`, `_channel`은 `makeAutoObservable`의 영향을 받으므로 비동기 완료 후 할당은 `runInAction`으로 감싼다:
```typescript
private async _initBroadcast(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // 미인증 시 broadcast 없이 종료
    const { data: profile } = await supabase
      .from('profiles').select('display_name').eq('id', user.id).single();
    const channel = supabase.channel(`group-progress:${this.groupId}`);
    await channel.subscribe();
    runInAction(() => {
      this._userId = user.id;
      this._displayName = profile?.display_name ?? user.email?.split('@')[0] ?? null;
      this._channel = channel;
    });
  } catch {
    // broadcast 실패 시 silent — tracking 자체는 계속
  }
}
```
`_channel`이 null인 동안 `setInterval` broadcast 조건(`if (this._channel && this._userId)`)이 이미 skip 처리됨.

**`setInterval` callback change (every 1s):** Broadcast current progress:
```typescript
if (this._channel && this._userId) {
  void this._channel.send({
    type: 'broadcast', event: 'progress',
    payload: { userId: this._userId, displayName: this._displayName, maxRouteMeters: this.maxRouteMeters },
  });
}
```

**`addPoint()` change:** After pushing a new point, recalculate `maxRouteMeters`:
```typescript
this.maxRouteMeters = maxRouteProgress(this.points, this.routePoints);
```
성능: O(n×m) (트래킹 포인트 × 루트 세그먼트). 일반적인 GPX(수백 웨이포인트)와 단일 세션(수십 포인트)에서는 허용 범위. 최적화가 필요하면 직전 best 세그먼트 인덱스를 캐시해 앞부분 스킵 가능 — 현재는 Out of Scope.

**`_save()` change:** Add `max_route_meters` to the INSERT payload:
```typescript
const { error } = await supabase.from('tracking_sessions').insert({
  user_id:          user.id,
  group_id:         this.groupId,
  elapsed_seconds:  this.elapsedSeconds,
  distance_meters:  this.distanceMeters,
  points:           this.points,
  max_route_meters: this.maxRouteMeters,   // ← 추가
});
```

**`dispose()` change:** Unsubscribe and remove the channel:
```typescript
if (this._channel) {
  void supabase.removeChannel(this._channel);
  this._channel = null;
}
```

### GroupMapStore changes

New state loaded from `groups` in `load()`:
- `periodStartedAt: Date | null = null` (초기값 `null`)
- `periodEndedAt: Date | null = null` (초기값 `null`)
- computed `isPeriodActive: boolean` → `periodStartedAt !== null && periodEndedAt === null`

New actions:
```typescript
async startPeriod(): Promise<void>  // UPDATE groups SET period_started_at=now(), period_ended_at=null WHERE id=groupId
async endPeriod(): Promise<void>    // UPDATE groups SET period_ended_at=now() WHERE id=groupId
```

### LeaderboardStore — `src/stores/LeaderboardStore.ts`

Does not require `navigate` injection.

Constructor: `(groupId: string)`

State:
- `rankings: { userId: string; displayName: string; maxRouteMeters: number; isLive: boolean }[]`
- `loading: boolean`
- `error: string | null`
- `private _channel: ReturnType<typeof supabase.channel> | null = null`

**`load(periodStartedAt: Date | null)`** (called from `useEffect` after `store.periodStartedAt` is available):
0. 기존 채널이 있으면 먼저 정리: `if (this._channel) { supabase.removeChannel(this._channel); this._channel = null; }` — 재호출 시 중복 구독 방지.
1. Set `loading = true`.
2. Query DB using Supabase JS — `tracking_sessions`와 `profiles` 간 직접 FK 없음(둘 다 `auth.users` 참조) → 2-step 클라이언트 집계:
   ```typescript
   // Step 1: tracking_sessions 조회
   let query = supabase
     .from('tracking_sessions')
     .select('user_id, max_route_meters')
     .eq('group_id', groupId);
   if (periodStartedAt) query = query.gte('created_at', periodStartedAt.toISOString());
   const { data: sessions } = await query;

   // Step 2: 유니크 user_id별 max 집계
   const maxByUser = new Map<string, number>();
   for (const row of sessions ?? []) {
     const prev = maxByUser.get(row.user_id) ?? 0;
     maxByUser.set(row.user_id, Math.max(prev, row.max_route_meters ?? 0));
   }

   // Step 3: profiles 조회 (user_id 목록으로 필터)
   const userIds = [...maxByUser.keys()];
   const { data: profiles } = userIds.length
     ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
     : { data: [] };
   const nameMap = new Map(profiles?.map(p => [p.id, p.display_name]) ?? []);
   ```
3. Set `rankings` from aggregated result (`isLive: false`):
   - `displayName`: `nameMap.get(userId) ?? '알 수 없음'`
   - Sorted by `maxRouteMeters DESC`
4. Set `loading = false`. (Realtime 구독은 비동기로 이후 완료 — 의도적으로 로딩 완료로 처리)
5. Subscribe to Supabase Realtime channel `group-progress:{groupId}` for `progress` broadcast events (독립 채널 인스턴스). 저장: `this._channel = channel`.
6. On each broadcast `{ userId, displayName, maxRouteMeters }`: upsert into `rankings` by `userId`:
   - `maxRouteMeters`: broadcast 값으로 교체
   - `displayName`: 이미 DB에서 로드된 이름이 있으면 유지, "알 수 없음"이면 broadcast 값으로 교체
   - `isLive: true`
7. Re-sort `rankings` by `maxRouteMeters DESC`.

**`dispose()`:**
```typescript
dispose(): void {
  if (this._channel) {
    supabase.removeChannel(this._channel);
    this._channel = null;
  }
}
```

**Realtime 채널 격리:** TrackingStore(송신)와 LeaderboardStore(수신)는 동일한 채널 이름으로 각각 독립적인 인스턴스를 생성한다. `supabase.removeChannel(instance)`은 해당 인스턴스만 제거하므로 서로 영향을 주지 않는다.

### GroupMapPage changes

1. **GPX parsing:**
   ```typescript
   const routePoints = useMemo(
     () => store.gpxText ? parseGpxPoints(store.gpxText) : [],
     [store.gpxText]
   );
   ```
2. **TrackingStore:** `useState(() => new TrackingStore(id!, []))` — 초기값 빈 배열. GPX 로드 후 별도 `useEffect`에서 `trackingStore.setRoutePoints(routePoints)` 호출:
   ```typescript
   useEffect(() => {
     if (routePoints.length > 0) trackingStore.setRoutePoints(routePoints);
   }, [trackingStore, routePoints]);
   ```
3. **LeaderboardStore:** `useState(() => new LeaderboardStore(id!))`
4. **`useEffect` for leaderboard load:** `store.gpxText`와 `store.group`이 모두 `undefined`가 아닌 시점(로드 완료)에 `leaderboardStore.load(store.periodStartedAt ?? null)` 호출. `periodStartedAt`이 null이면 기간 필터 없이 전체 조회:
   ```typescript
   useEffect(() => {
     if (store.group !== undefined && store.gpxText !== undefined) {
       leaderboardStore.load(store.periodStartedAt ?? null);
     }
   }, [leaderboardStore, store.group, store.gpxText, store.periodStartedAt]);
   ```
5. **Chip tabs:** `activeTab: 'map' | 'leaderboard'`, 초기값 `'map'`
6. **Admin period buttons:**
   - `!store.isPeriodActive` → green "▶ 활동 시작" (지도 탭에서 표시)
   - `store.isPeriodActive` → red "■ 활동 종료" (순위 탭 하단)
   - Visible only when `currentUserId === group.created_by`

### ProfilePage changes (`src/pages/ProfilePage.tsx`)

Add `display_name` input field. On save:
```typescript
await supabase.from('profiles').upsert({ id: userId, display_name }, { onConflict: 'id' });
```
If no profile row exists yet: INSERT. If exists: UPDATE. Conflict key: `id`.

프로필 미생성 사용자(프로필 페이지를 방문하지 않은 경우)는 auth trigger 없이 방치한다. 가입 시 자동 생성은 Out of Scope. TrackingStore.start()에서 profiles row가 없으면 이메일 prefix를 `_displayName`으로 사용하고 broadcast에 포함한다.

Display name fallback order in leaderboard (client-side):
1. `profiles.display_name` (DB LEFT JOIN 결과)
2. broadcast payload의 `displayName` (이메일 prefix, isLive=true인 경우)
3. "알 수 없음"

## UI

**Chip tabs** — group map page 상단 (뒤로가기 버튼 아래):
```
[ 🗺 지도 ]  [ 🏆 순위 ]
```
초기값: `지도` 탭 활성.

**Leaderboard panel** (순위 탭):
- 활동 중: 초록 상태바 "● 활동 중 · 1초마다 갱신"
- 활동 종료: 회색 상태바 "활동 기간: YYYY-MM-DD ~ MM-DD"
- 기간 없음(period_started_at null): 회색 상태바 "활동 기간이 없습니다"
- Ranked list rows: `[rank] [display_name] [X.Xkm] [🔴 라이브]` (라이브 배지는 isLive일 때만)
- Current user row highlighted (userId 비교)
- Admin + period active: "■ 활동 종료" button at bottom

**지도 탭:**
- Admin + period inactive: "▶ 활동 시작" button (하단 중앙, 트래킹 시작 버튼 위)
- Admin + period active: 버튼 없음 (순위 탭에서 종료)

## Error Handling

- `routePoints` empty (GPX null): `maxRouteProgress` returns 0; leaderboard shows 0m for all
- No active period (`periodStartedAt` null): DB query skips date filter; shows all-time data
- Realtime connection failure: rankings show last received data with no live indicator
- No profile / display_name null: "알 수 없음" fallback

## Files

| File | Change |
|------|--------|
| `supabase/migrations/20260322000002_leaderboard.sql` | profiles table + RLS + groups/sessions ALTER |
| `src/utils/routeProjection.ts` | New — parseGpxPoints + maxRouteProgress |
| `src/stores/LeaderboardStore.ts` | New — rankings state, Realtime + DB |
| `src/stores/TrackingStore.ts` | routePoints param + setRoutePoints(), maxRouteMeters, _initBroadcast(), _save() max_route_meters |
| `src/stores/TrackingStore.test.ts` | 생성자 인자 `(groupId, [])` 로 업데이트, 새 기능 테스트 추가 |
| `src/stores/GroupMapStore.ts` | period state + startPeriod/endPeriod |
| `src/types/group.ts` | Group 인터페이스에 `period_started_at`, `period_ended_at` 추가 |
| `src/pages/GroupMapPage.tsx` | Chip tabs, admin buttons, LeaderboardStore, routePoints memo |
| `src/pages/ProfilePage.tsx` | display_name field + profiles upsert |

## Out of Scope

- Push notifications when someone reaches a milestone
- Historical period comparison (multiple past periods)
- Course completion badge / finish detection
- Pause/resume tracking
- Offline support
