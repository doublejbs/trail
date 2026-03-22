# Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹 관리자가 활동 기간을 시작/종료하고, 기간 중 GPS 트래킹 참가자들의 경로 진행도를 1초 단위 실시간 순위로 표시한다.

**Architecture:** TrackingStore가 Supabase Realtime broadcast로 1초마다 진행도를 전송하고 세션 종료 시 DB에 저장. LeaderboardStore가 DB 조회 + Realtime 구독을 병합해 실시간 순위를 유지. GroupMapPage에 지도/순위 칩 탭과 관리자 기간 버튼을 추가한다.

**Tech Stack:** TypeScript, MobX 6, Supabase JS SDK v2 (Realtime broadcast), Vitest, React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-22-leaderboard-design.md`

---

## File Map

| File | Role |
|------|------|
| `supabase/migrations/20260322000002_leaderboard.sql` | 신규 — profiles 테이블 + groups/tracking_sessions 컬럼 추가 |
| `src/types/group.ts` | 수정 — period_started_at, period_ended_at 필드 추가 |
| `src/utils/routeProjection.ts` | 신규 — parseGpxPoints + maxRouteProgress (+ haversineMeters 공유) |
| `src/utils/routeProjection.test.ts` | 신규 — routeProjection 유틸 테스트 |
| `src/stores/TrackingStore.ts` | 수정 — routePoints 파라미터, setRoutePoints(), maxRouteMeters, _initBroadcast(), dispose 채널 정리, _save()에 max_route_meters 추가 |
| `src/stores/TrackingStore.test.ts` | 수정 — 생성자 인자 변경, supabase mock 확장(profiles/channel), 새 테스트 추가 |
| `src/stores/GroupMapStore.ts` | 수정 — period 상태, startPeriod(), endPeriod() |
| `src/stores/GroupMapStore.test.ts` | 신규 — GroupMapStore 테스트 |
| `src/stores/LeaderboardStore.ts` | 신규 — DB 조회 + Realtime 구독 순위 관리 |
| `src/stores/LeaderboardStore.test.ts` | 신규 — LeaderboardStore 테스트 |
| `src/stores/ProfileStore.ts` | 신규 — display_name 로드/저장 |
| `src/stores/ProfileStore.test.ts` | 신규 — ProfileStore 테스트 |
| `src/pages/GroupMapPage.tsx` | 수정 — 칩 탭, 관리자 버튼, LeaderboardStore 통합 |
| `src/pages/GroupMapPage.test.tsx` | 수정 — 새 mock 필드, 칩 탭/리더보드/관리자 버튼 테스트 |
| `src/pages/ProfilePage.tsx` | 수정 — display_name 입력 필드 추가 |

---

## Task 1: DB 마이그레이션 및 타입

**Files:**
- Create: `supabase/migrations/20260322000002_leaderboard.sql`
- Modify: `src/types/group.ts`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260322000002_leaderboard.sql`:
```sql
-- ============================================================
-- profiles 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "user can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "authenticated users can view profiles"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- groups 테이블 — 활동 기간 컬럼 추가
-- ============================================================
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS period_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_ended_at   TIMESTAMPTZ;

-- ============================================================
-- tracking_sessions 테이블 — 경로 진행 거리 컬럼 추가
-- ============================================================
ALTER TABLE tracking_sessions
  ADD COLUMN IF NOT EXISTS max_route_meters NUMERIC(10,2);
```

- [ ] **Step 2: Group 타입 업데이트**

`src/types/group.ts`:
```typescript
export interface Group {
  id: string;
  name: string;
  created_by: string;
  gpx_path: string;
  gpx_bucket: string;
  created_at: string;
  max_members: number | null;
  period_started_at: string | null;
  period_ended_at: string | null;
}
```

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260322000002_leaderboard.sql src/types/group.ts
git commit -m "feat: 리더보드 DB 마이그레이션 및 Group 타입 업데이트"
```

---

## Task 2: routeProjection 유틸리티 (TDD)

**Files:**
- Create: `src/utils/routeProjection.ts`
- Create: `src/utils/routeProjection.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/routeProjection.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseGpxPoints, maxRouteProgress } from './routeProjection';

const SIMPLE_GPX = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="37.5" lon="126.9"></trkpt>
    <trkpt lat="37.51" lon="126.9"></trkpt>
  </trkseg></trk>
</gpx>`;

describe('parseGpxPoints', () => {
  it('GPX 텍스트에서 위경도 배열 반환', () => {
    const result = parseGpxPoints(SIMPLE_GPX);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ lat: 37.5, lng: 126.9 });
    expect(result[1]).toEqual({ lat: 37.51, lng: 126.9 });
  });

  it('빈 문자열이면 빈 배열', () => {
    expect(parseGpxPoints('')).toEqual([]);
  });

  it('잘못된 XML이면 빈 배열', () => {
    expect(parseGpxPoints('not xml')).toEqual([]);
  });
});

describe('maxRouteProgress', () => {
  const routePoints = [
    { lat: 37.5, lng: 126.9 },
    { lat: 37.52, lng: 126.9 },
  ];

  it('trackingPoints 빈 배열이면 0 반환', () => {
    expect(maxRouteProgress([], routePoints)).toBe(0);
  });

  it('routePoints 1개 이하면 0 반환', () => {
    expect(maxRouteProgress([{ lat: 37.5, lng: 126.9 }], [])).toBe(0);
    expect(maxRouteProgress([{ lat: 37.5, lng: 126.9 }], [{ lat: 37.5, lng: 126.9 }])).toBe(0);
  });

  it('경로 중간 지점 — 진행도 > 0', () => {
    const track = [{ lat: 37.51, lng: 126.9 }]; // 경로 50% 지점
    const result = maxRouteProgress(track, routePoints);
    expect(result).toBeGreaterThan(0);
  });

  it('경로 끝 지점 — 최대 진행도', () => {
    const atEnd = [{ lat: 37.52, lng: 126.9 }];
    const atMid = [{ lat: 37.51, lng: 126.9 }];
    expect(maxRouteProgress(atEnd, routePoints)).toBeGreaterThan(
      maxRouteProgress(atMid, routePoints)
    );
  });

  it('여러 포인트 중 가장 앞선 진행도 반환', () => {
    const track = [
      { lat: 37.505, lng: 126.9 }, // ~25%
      { lat: 37.515, lng: 126.9 }, // ~75%
    ];
    const single = [{ lat: 37.505, lng: 126.9 }];
    expect(maxRouteProgress(track, routePoints)).toBeGreaterThan(
      maxRouteProgress(single, routePoints)
    );
  });

  it('경로에서 벗어난 포인트도 가장 가까운 세그먼트에 투영', () => {
    const offRoute = [{ lat: 37.51, lng: 127.0 }]; // lng가 크게 벗어남
    const result = maxRouteProgress(offRoute, routePoints);
    expect(result).toBeGreaterThan(0); // 여전히 진행도 반환
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/utils/routeProjection.test.ts
```
Expected: FAIL (파일 없음)

- [ ] **Step 3: routeProjection 구현**

`src/utils/routeProjection.ts`:
```typescript
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function parseGpxPoints(gpxText: string): { lat: number; lng: number }[] {
  if (!gpxText) return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxText, 'application/xml');
    if (doc.querySelector('parsererror')) return [];
    const trkpts = doc.querySelectorAll('trkpt');
    return Array.from(trkpts)
      .map((pt) => ({
        lat: parseFloat(pt.getAttribute('lat') ?? ''),
        lng: parseFloat(pt.getAttribute('lon') ?? ''),
      }))
      .filter((p) => !isNaN(p.lat) && !isNaN(p.lng));
  } catch {
    return [];
  }
}

export function maxRouteProgress(
  trackingPoints: { lat: number; lng: number }[],
  routePoints: { lat: number; lng: number }[]
): number {
  if (trackingPoints.length === 0 || routePoints.length < 2) return 0;

  let maxProgress = 0;

  for (const P of trackingPoints) {
    let bestDist = Infinity;
    let bestSegIdx = 0;
    let bestT = 0;

    for (let i = 0; i < routePoints.length - 1; i++) {
      const A = routePoints[i];
      const B = routePoints[i + 1];
      const apLat = P.lat - A.lat;
      const apLng = P.lng - A.lng;
      const abLat = B.lat - A.lat;
      const abLng = B.lng - A.lng;
      const ab2 = abLat * abLat + abLng * abLng;
      const t = ab2 > 0 ? clamp((apLat * abLat + apLng * abLng) / ab2, 0, 1) : 0;
      const qLat = A.lat + t * abLat;
      const qLng = A.lng + t * abLng;
      const dist = haversineMeters(P.lat, P.lng, qLat, qLng);

      if (dist < bestDist) {
        bestDist = dist;
        bestSegIdx = i;
        bestT = t;
      }
    }

    let progress = 0;
    for (let k = 0; k < bestSegIdx; k++) {
      progress += haversineMeters(
        routePoints[k].lat, routePoints[k].lng,
        routePoints[k + 1].lat, routePoints[k + 1].lng
      );
    }
    const A = routePoints[bestSegIdx];
    const B = routePoints[bestSegIdx + 1];
    progress += bestT * haversineMeters(A.lat, A.lng, B.lat, B.lng);

    if (progress > maxProgress) maxProgress = progress;
  }

  return maxProgress;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/utils/routeProjection.test.ts
```
Expected: ALL PASS

- [ ] **Step 5: 커밋**

```bash
git add src/utils/routeProjection.ts src/utils/routeProjection.test.ts
git commit -m "feat: routeProjection 유틸 추가 (parseGpxPoints, maxRouteProgress)"
```

---

## Task 3: TrackingStore 업데이트 (TDD)

**Files:**
- Modify: `src/stores/TrackingStore.ts`
- Modify: `src/stores/TrackingStore.test.ts`

- [ ] **Step 1: TrackingStore.test.ts 전체 교체**

기존 mock을 확장하고 새 테스트를 추가한다. `src/stores/TrackingStore.test.ts` 전체를 아래로 교체:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInAction } from 'mobx';
import { TrackingStore } from './TrackingStore';

const {
  mockGetUser, mockInsert, mockProfileSelect,
  mockChannelSubscribe, mockChannelSend, mockRemoveChannel,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockInsert: vi.fn(),
  mockProfileSelect: vi.fn(),
  mockChannelSubscribe: vi.fn(),
  mockChannelSend: vi.fn(),
  mockRemoveChannel: vi.fn(),
}));

const mockChannel = {
  subscribe: () => mockChannelSubscribe(),
  send: (...args: unknown[]) => mockChannelSend(...args),
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: () => mockProfileSelect() }) }),
        };
      }
      return { insert: (...args: unknown[]) => mockInsert(...args) };
    },
    channel: () => mockChannel,
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('TrackingStore', () => {
  let store: TrackingStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    store = new TrackingStore('test-group-id', []);
  });

  afterEach(() => {
    store.dispose();
    vi.useRealTimers();
  });

  describe('초기 상태', () => {
    it('isTracking이 false', () => {
      expect(store.isTracking).toBe(false);
    });

    it('elapsedSeconds가 0', () => {
      expect(store.elapsedSeconds).toBe(0);
    });

    it('distanceMeters가 0', () => {
      expect(store.distanceMeters).toBe(0);
    });

    it('speedKmh가 0', () => {
      expect(store.speedKmh).toBe(0);
    });

    it('points가 빈 배열', () => {
      expect(store.points).toEqual([]);
    });

    it('maxRouteMeters가 0', () => {
      expect(store.maxRouteMeters).toBe(0);
    });
  });

  describe('start()', () => {
    it('isTracking을 true로 설정', () => {
      store.start();
      expect(store.isTracking).toBe(true);
    });

    it('1초마다 elapsedSeconds 증가', () => {
      store.start();
      vi.advanceTimersByTime(3000);
      expect(store.elapsedSeconds).toBe(3);
    });

    it('재호출 시 상태 리셋', () => {
      store.start();
      vi.advanceTimersByTime(5000);
      store.start();
      expect(store.elapsedSeconds).toBe(0);
      expect(store.distanceMeters).toBe(0);
      expect(store.speedKmh).toBe(0);
      expect(store.points).toEqual([]);
    });
  });

  describe('stop()', () => {
    it('isTracking을 false로 설정', () => {
      store.start();
      store.stop();
      expect(store.isTracking).toBe(false);
    });

    it('stop 후 타이머 멈춤 — elapsedSeconds 증가 없음', () => {
      store.start();
      vi.advanceTimersByTime(2000);
      store.stop();
      vi.advanceTimersByTime(3000);
      expect(store.elapsedSeconds).toBe(2);
    });

    it('stop 후 상태 보존 (리셋 안됨)', () => {
      store.start();
      vi.advanceTimersByTime(2000);
      store.stop();
      expect(store.elapsedSeconds).toBe(2);
    });
  });

  describe('dispose()', () => {
    it('dispose 후 타이머 멈춤', () => {
      store.start();
      vi.advanceTimersByTime(2000);
      store.dispose();
      vi.advanceTimersByTime(3000);
      expect(store.elapsedSeconds).toBe(2);
    });

    it('트래킹 중이 아닐 때 dispose 호출해도 에러 없음', () => {
      expect(() => store.dispose()).not.toThrow();
    });
  });

  describe('addPoint()', () => {
    it('isTracking이 false이면 무시', () => {
      store.addPoint(37.5, 126.9);
      expect(store.distanceMeters).toBe(0);
    });

    it('첫 번째 포인트 — distance 0, speed 0', () => {
      store.start();
      store.addPoint(37.5, 126.9);
      expect(store.distanceMeters).toBe(0);
      expect(store.speedKmh).toBe(0);
    });

    it('두 번째 포인트 — distance 누적', () => {
      store.start();
      store.addPoint(37.5, 126.9);
      store.addPoint(37.501, 126.9);
      expect(store.distanceMeters).toBeGreaterThan(0);
    });

    it('두 번째 포인트 — speed 계산', () => {
      store.start();
      const ts1 = Date.now();
      vi.setSystemTime(ts1);
      store.addPoint(37.5, 126.9);
      vi.setSystemTime(ts1 + 1000);
      store.addPoint(37.501, 126.9);
      expect(store.speedKmh).toBeGreaterThan(0);
    });
  });

  describe('computed', () => {
    it('formattedTime — 0초는 "00:00:00"', () => {
      expect(store.formattedTime).toBe('00:00:00');
    });

    it('formattedTime — 3661초는 "01:01:01"', () => {
      store.start();
      vi.advanceTimersByTime(3661000);
      expect(store.formattedTime).toBe('01:01:01');
    });

    it('formattedDistance — 999m는 "999m"', () => {
      store.start();
      runInAction(() => { store.distanceMeters = 999; });
      expect(store.formattedDistance).toBe('999m');
    });

    it('formattedDistance — 1000m는 "1.0km"', () => {
      store.start();
      runInAction(() => { store.distanceMeters = 1000; });
      expect(store.formattedDistance).toBe('1.0km');
    });

    it('formattedDistance — 1500m는 "1.5km"', () => {
      store.start();
      runInAction(() => { store.distanceMeters = 1500; });
      expect(store.formattedDistance).toBe('1.5km');
    });

    it('formattedSpeed — "0.0km/h"', () => {
      expect(store.formattedSpeed).toBe('0.0km/h');
    });

    it('formattedSpeed — speedKmh 반영', () => {
      store.start();
      runInAction(() => { store.speedKmh = 5.67; });
      expect(store.formattedSpeed).toBe('5.7km/h');
    });
  });

  describe('저장 기능', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user-1@test.com' } }, error: null });
      mockInsert.mockResolvedValue({ error: null });
      mockProfileSelect.mockResolvedValue({ data: null });
      mockChannelSubscribe.mockReturnValue(undefined);
      mockChannelSend.mockResolvedValue({});
    });

    it('stop() 후 elapsedSeconds > 0이면 Supabase INSERT 호출', async () => {
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await vi.runAllTimersAsync();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          group_id: 'test-group-id',
          elapsed_seconds: 1,
        })
      );
    });

    it('INSERT에 max_route_meters 포함', async () => {
      store.setRoutePoints([{ lat: 37.5, lng: 126.9 }, { lat: 37.51, lng: 126.9 }]);
      store.start();
      store.addPoint(37.505, 126.9);
      vi.advanceTimersByTime(1000);
      store.stop();
      await vi.runAllTimersAsync();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ max_route_meters: expect.any(Number) })
      );
    });

    it('stop() 후 elapsedSeconds === 0이면 INSERT 미호출', async () => {
      store.start();
      store.stop();
      await vi.runAllTimersAsync();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('저장 중 saving === true', async () => {
      mockInsert.mockImplementation(() => new Promise(() => {}));
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await Promise.resolve();
      expect(store.saving).toBe(true);
    });

    it('저장 성공 후 saving === false', async () => {
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await vi.runAllTimersAsync();
      expect(store.saving).toBe(false);
    });

    it('getUser가 null 반환 시 INSERT 미호출', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await vi.runAllTimersAsync();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('INSERT 실패 시 saveError 설정', async () => {
      mockInsert.mockResolvedValue({ error: { message: '저장 실패' } });
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await vi.runAllTimersAsync();
      expect(store.saveError).toBe('저장 실패');
    });
  });

  describe('routePoints / maxRouteMeters', () => {
    it('setRoutePoints() 후 addPoint()하면 maxRouteMeters 업데이트', () => {
      store.setRoutePoints([{ lat: 37.5, lng: 126.9 }, { lat: 37.51, lng: 126.9 }]);
      store.start();
      store.addPoint(37.505, 126.9);
      expect(store.maxRouteMeters).toBeGreaterThan(0);
    });

    it('routePoints 빈 배열이면 maxRouteMeters 0 유지', () => {
      store.start();
      store.addPoint(37.5, 126.9);
      store.addPoint(37.501, 126.9);
      expect(store.maxRouteMeters).toBe(0);
    });
  });

  describe('broadcast', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@test.com' } }, error: null });
      mockProfileSelect.mockResolvedValue({ data: { display_name: '홍길동' } });
      mockChannelSubscribe.mockReturnValue(undefined);
      mockChannelSend.mockResolvedValue({});
    });

    it('start() 후 _initBroadcast가 채널 구독', async () => {
      store.start();
      await vi.runAllTimersAsync();
      expect(mockChannelSubscribe).toHaveBeenCalled();
    });

    it('1초 후 채널로 broadcast 전송', async () => {
      store.start();
      await vi.runAllTimersAsync();
      vi.advanceTimersByTime(1000);
      expect(mockChannelSend).toHaveBeenCalled();
    });

    it('dispose() 시 채널 제거', async () => {
      store.start();
      await vi.runAllTimersAsync();
      store.dispose();
      expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it('미인증 시 broadcast 미전송', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      store.start();
      await vi.runAllTimersAsync();
      vi.advanceTimersByTime(1000);
      expect(mockChannelSend).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/TrackingStore.test.ts
```
Expected: FAIL (routePoints 파라미터 없음, maxRouteMeters 없음, broadcast 없음)

- [ ] **Step 3: TrackingStore.ts 전체 교체**

`src/stores/TrackingStore.ts`:
```typescript
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { haversineMeters, maxRouteProgress } from '../utils/routeProjection';

class TrackingStore {
  public isTracking: boolean = false;
  public elapsedSeconds: number = 0;
  public distanceMeters: number = 0;
  public speedKmh: number = 0;
  public points: { lat: number; lng: number; ts: number }[] = [];
  public saving: boolean = false;
  public saveError: string | null = null;
  public maxRouteMeters: number = 0;

  private timerId: ReturnType<typeof setInterval> | null = null;
  private _userId: string | null = null;
  private _displayName: string | null = null;
  private _channel: ReturnType<typeof supabase.channel> | null = null;

  public constructor(
    private groupId: string,
    private routePoints: { lat: number; lng: number }[]
  ) {
    makeAutoObservable(this);
  }

  public setRoutePoints(points: { lat: number; lng: number }[]): void {
    this.routePoints = points;
  }

  public start(): void {
    this._clearTimer();
    this.isTracking = true;
    this.elapsedSeconds = 0;
    this.distanceMeters = 0;
    this.speedKmh = 0;
    this.points = [];
    this.saveError = null;
    this.maxRouteMeters = 0;
    this.timerId = setInterval(() => {
      runInAction(() => { this.elapsedSeconds += 1; });
      if (this._channel && this._userId) {
        void this._channel.send({
          type: 'broadcast',
          event: 'progress',
          payload: {
            userId: this._userId,
            displayName: this._displayName,
            maxRouteMeters: this.maxRouteMeters,
          },
        });
      }
    }, 1000);
    void this._initBroadcast();
  }

  public stop(): void {
    this._clearTimer();
    this.isTracking = false;
    if (this.elapsedSeconds > 0) {
      void this._save();
    }
  }

  public dispose(): void {
    this._clearTimer();
    if (this._channel) {
      void supabase.removeChannel(this._channel);
      runInAction(() => { this._channel = null; });
    }
  }

  public addPoint(lat: number, lng: number): void {
    if (!this.isTracking) return;
    const point = { lat, lng, ts: Date.now() };
    if (this.points.length > 0) {
      const prev = this.points[this.points.length - 1];
      const meters = haversineMeters(prev.lat, prev.lng, lat, lng);
      this.distanceMeters += meters;
      const dtHours = (point.ts - prev.ts) / 3_600_000;
      this.speedKmh = dtHours > 0 ? (meters / 1000) / dtHours : 0;
    }
    this.points.push(point);
    this.maxRouteMeters = maxRouteProgress(this.points, this.routePoints);
  }

  public get formattedTime(): string {
    const h = Math.floor(this.elapsedSeconds / 3600);
    const m = Math.floor((this.elapsedSeconds % 3600) / 60);
    const s = this.elapsedSeconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  }

  public get formattedDistance(): string {
    if (this.distanceMeters < 1000) {
      return `${Math.round(this.distanceMeters)}m`;
    }
    return `${(this.distanceMeters / 1000).toFixed(1)}km`;
  }

  public get formattedSpeed(): string {
    return `${this.speedKmh.toFixed(1)}km/h`;
  }

  private async _initBroadcast(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
      runInAction(() => {
        this._userId = user.id;
        this._displayName = profile?.display_name ?? user.email?.split('@')[0] ?? null;
        this._channel = supabase.channel(`group-progress:${this.groupId}`);
        this._channel.subscribe();
      });
    } catch {
      // broadcast 실패 시 silent — tracking 자체는 계속
    }
  }

  private async _save(): Promise<void> {
    runInAction(() => { this.saving = true; this.saveError = null; });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('인증되지 않은 사용자');
      const { error } = await supabase.from('tracking_sessions').insert({
        user_id:          user.id,
        group_id:         this.groupId,
        elapsed_seconds:  this.elapsedSeconds,
        distance_meters:  this.distanceMeters,
        points:           this.points,
        max_route_meters: this.maxRouteMeters,
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

  private _clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

export { TrackingStore };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/stores/TrackingStore.test.ts
```
Expected: ALL PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/TrackingStore.ts src/stores/TrackingStore.test.ts
git commit -m "feat: TrackingStore routePoints, maxRouteMeters, broadcast 추가"
```

---

## Task 4: GroupMapStore 기간 관리 (TDD)

**Files:**
- Modify: `src/stores/GroupMapStore.ts`
- Create: `src/stores/GroupMapStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/GroupMapStore.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupMapStore } from './GroupMapStore';

const { mockSelect, mockUpdate, mockGetUser, mockGetSignedUrl, mockFetch } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetSignedUrl: vi.fn(),
  mockFetch: vi.fn(),
}));

const FAKE_GROUP = {
  id: 'group-1',
  name: '한라산',
  created_by: 'user-1',
  gpx_path: 'user-1/g1.gpx',
  gpx_bucket: 'gpx-files',
  created_at: '2026-01-01T00:00:00Z',
  max_members: null,
  period_started_at: null,
  period_ended_at: null,
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => mockSelect(),
        }),
      }),
      update: (data: unknown) => ({
        eq: () => mockUpdate(data),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: () => mockGetSignedUrl(),
      }),
    },
  },
}));

vi.stubGlobal('fetch', mockFetch);

describe('GroupMapStore', () => {
  let store: GroupMapStore;
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    store = new GroupMapStore(navigate);
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://fake.url/g.gpx' }, error: null });
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<gpx/>') });
  });

  describe('period 상태 초기값', () => {
    it('periodStartedAt이 null', () => {
      expect(store.periodStartedAt).toBeNull();
    });

    it('periodEndedAt이 null', () => {
      expect(store.periodEndedAt).toBeNull();
    });

    it('isPeriodActive가 false', () => {
      expect(store.isPeriodActive).toBe(false);
    });
  });

  describe('load() — period 컬럼 파싱', () => {
    it('period_started_at이 있으면 periodStartedAt Date로 설정', async () => {
      mockSelect.mockResolvedValue({
        data: { ...FAKE_GROUP, period_started_at: '2026-03-22T09:00:00Z' },
        error: null,
      });
      store.load('group-1');
      await vi.waitFor(() => store.group !== undefined);
      expect(store.periodStartedAt).toBeInstanceOf(Date);
    });

    it('period_started_at이 null이면 periodStartedAt null', async () => {
      mockSelect.mockResolvedValue({ data: FAKE_GROUP, error: null });
      store.load('group-1');
      await vi.waitFor(() => store.group !== undefined);
      expect(store.periodStartedAt).toBeNull();
    });

    it('period_started_at있고 period_ended_at없으면 isPeriodActive true', async () => {
      mockSelect.mockResolvedValue({
        data: { ...FAKE_GROUP, period_started_at: '2026-03-22T09:00:00Z', period_ended_at: null },
        error: null,
      });
      store.load('group-1');
      await vi.waitFor(() => store.group !== undefined);
      expect(store.isPeriodActive).toBe(true);
    });
  });

  describe('startPeriod()', () => {
    it('groups UPDATE 호출 (period_started_at=now, period_ended_at=null)', async () => {
      mockUpdate.mockResolvedValue({ error: null });
      mockSelect.mockResolvedValue({ data: FAKE_GROUP, error: null });
      store.load('group-1');
      await vi.waitFor(() => store.group !== undefined);
      await store.startPeriod();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ period_ended_at: null })
      );
    });

    it('성공 후 periodStartedAt이 Date로 설정', async () => {
      mockUpdate.mockResolvedValue({ error: null });
      mockSelect.mockResolvedValue({ data: FAKE_GROUP, error: null });
      store.load('group-1');
      await vi.waitFor(() => store.group !== undefined);
      await store.startPeriod();
      expect(store.periodStartedAt).toBeInstanceOf(Date);
      expect(store.periodEndedAt).toBeNull();
    });
  });

  describe('endPeriod()', () => {
    it('groups UPDATE 호출 (period_ended_at=now)', async () => {
      mockUpdate.mockResolvedValue({ error: null });
      mockSelect.mockResolvedValue({ data: FAKE_GROUP, error: null });
      store.load('group-1');
      await vi.waitFor(() => store.group !== undefined);
      await store.endPeriod();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ period_ended_at: expect.any(String) })
      );
    });

    it('성공 후 isPeriodActive가 false', async () => {
      mockUpdate.mockResolvedValue({ error: null });
      mockSelect.mockResolvedValue({
        data: { ...FAKE_GROUP, period_started_at: '2026-03-22T09:00:00Z' },
        error: null,
      });
      store.load('group-1');
      await vi.waitFor(() => store.group !== undefined);
      await store.endPeriod();
      expect(store.isPeriodActive).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/GroupMapStore.test.ts
```
Expected: FAIL (period 상태 없음, startPeriod/endPeriod 없음)

- [ ] **Step 3: GroupMapStore 수정**

`src/stores/GroupMapStore.ts` 전체 교체:
```typescript
import { makeAutoObservable, runInAction, computed } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

class GroupMapStore {
  private navigate: NavigateFunction;
  private groupId: string = '';
  public group: Group | null | undefined = undefined;
  public gpxText: string | null | undefined = undefined;
  public currentUserId: string | null = null;
  public periodStartedAt: Date | null = null;
  public periodEndedAt: Date | null = null;

  public get isPeriodActive(): boolean {
    return this.periodStartedAt !== null && this.periodEndedAt === null;
  }

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    makeAutoObservable(this, { isPeriodActive: computed });
  }

  public load(groupId: string): () => void {
    this.groupId = groupId;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (cancelled) return;

      if (error || !data) {
        runInAction(() => { this.group = null; });
        this.navigate('/group', { replace: true });
        return;
      }

      const [{ data: userData }, { data: urlData, error: urlError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.storage.from((data as Group).gpx_bucket ?? 'gpx-files').createSignedUrl((data as Group).gpx_path, 3600),
      ]);

      if (cancelled) return;

      runInAction(() => {
        this.group = data as Group;
        this.currentUserId = userData?.user?.id ?? null;
        this.periodStartedAt = (data as Group).period_started_at
          ? new Date((data as Group).period_started_at!)
          : null;
        this.periodEndedAt = (data as Group).period_ended_at
          ? new Date((data as Group).period_ended_at!)
          : null;
      });

      if (urlError || !urlData?.signedUrl) {
        runInAction(() => { this.gpxText = null; });
        return;
      }

      try {
        const response = await fetch(urlData.signedUrl);
        if (!response.ok) throw new Error('GPX fetch failed');
        const text = await response.text();
        if (!cancelled) runInAction(() => { this.gpxText = text; });
      } catch {
        if (!cancelled) runInAction(() => { this.gpxText = null; });
      }
    })();

    return () => { cancelled = true; };
  }

  public async startPeriod(): Promise<void> {
    const now = new Date();
    const { error } = await supabase
      .from('groups')
      .update({ period_started_at: now.toISOString(), period_ended_at: null })
      .eq('id', this.groupId);
    if (!error) {
      runInAction(() => {
        this.periodStartedAt = now;
        this.periodEndedAt = null;
      });
    }
  }

  public async endPeriod(): Promise<void> {
    const now = new Date();
    const { error } = await supabase
      .from('groups')
      .update({ period_ended_at: now.toISOString() })
      .eq('id', this.groupId);
    if (!error) {
      runInAction(() => { this.periodEndedAt = now; });
    }
  }
}

export { GroupMapStore };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/stores/GroupMapStore.test.ts
```
Expected: ALL PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/GroupMapStore.ts src/stores/GroupMapStore.test.ts
git commit -m "feat: GroupMapStore 활동 기간 관리 추가 (startPeriod/endPeriod)"
```

---

## Task 5: LeaderboardStore (TDD)

**Files:**
- Create: `src/stores/LeaderboardStore.ts`
- Create: `src/stores/LeaderboardStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/LeaderboardStore.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardStore } from './LeaderboardStore';

const { mockQuerySessions, mockQueryProfiles, mockChannelSubscribe, mockRemoveChannel } = vi.hoisted(() => ({
  mockQuerySessions: vi.fn(),
  mockQueryProfiles: vi.fn(),
  mockChannelSubscribe: vi.fn(),
  mockRemoveChannel: vi.fn(),
}));

let _broadcastHandler: ((msg: { payload: unknown }) => void) | null = null;

vi.mock('../lib/supabase', () => {
  const makeChain = (resolver: () => Promise<unknown>) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      in: () => chain,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        resolver().then(resolve, reject),
      catch: (reject: (e: unknown) => unknown) => resolver().catch(reject),
    };
    return chain;
  };

  const mockChannel = {
    on: (_type: string, _filter: unknown, cb: (msg: { payload: unknown }) => void) => {
      _broadcastHandler = cb;
      return mockChannel;
    },
    subscribe: () => { mockChannelSubscribe(); return mockChannel; },
  };

  return {
    supabase: {
      from: (table: string) =>
        makeChain(table === 'profiles' ? mockQueryProfiles : mockQuerySessions),
      channel: () => mockChannel,
      removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    },
  };
});

function triggerBroadcast(payload: unknown) {
  _broadcastHandler?.({ payload });
}

describe('LeaderboardStore', () => {
  let store: LeaderboardStore;

  beforeEach(() => {
    vi.clearAllMocks();
    _broadcastHandler = null;
    store = new LeaderboardStore('group-1');
    mockQuerySessions.mockResolvedValue({ data: [], error: null });
    mockQueryProfiles.mockResolvedValue({ data: [], error: null });
    mockChannelSubscribe.mockReturnValue(undefined);
  });

  describe('초기 상태', () => {
    it('rankings가 빈 배열', () => {
      expect(store.rankings).toEqual([]);
    });

    it('loading이 false', () => {
      expect(store.loading).toBe(false);
    });

    it('error가 null', () => {
      expect(store.error).toBeNull();
    });
  });

  describe('load()', () => {
    it('세션 없으면 rankings 빈 배열', async () => {
      await store.load(null);
      expect(store.rankings).toEqual([]);
      expect(store.loading).toBe(false);
    });

    it('세션 있으면 user_id별 max 집계해 rankings 설정', async () => {
      mockQuerySessions.mockResolvedValue({
        data: [
          { user_id: 'u1', max_route_meters: 100 },
          { user_id: 'u1', max_route_meters: 200 },
          { user_id: 'u2', max_route_meters: 150 },
        ],
        error: null,
      });
      mockQueryProfiles.mockResolvedValue({
        data: [
          { id: 'u1', display_name: '김철수' },
          { id: 'u2', display_name: '이영희' },
        ],
        error: null,
      });
      await store.load(null);
      expect(store.rankings).toHaveLength(2);
      expect(store.rankings[0]).toMatchObject({ userId: 'u1', maxRouteMeters: 200, displayName: '김철수' });
      expect(store.rankings[1]).toMatchObject({ userId: 'u2', maxRouteMeters: 150, displayName: '이영희' });
    });

    it('프로필 없는 유저는 "알 수 없음" 표시', async () => {
      mockQuerySessions.mockResolvedValue({
        data: [{ user_id: 'u1', max_route_meters: 100 }],
        error: null,
      });
      await store.load(null);
      expect(store.rankings[0].displayName).toBe('알 수 없음');
    });

    it('maxRouteMeters 내림차순 정렬', async () => {
      mockQuerySessions.mockResolvedValue({
        data: [
          { user_id: 'u2', max_route_meters: 50 },
          { user_id: 'u1', max_route_meters: 200 },
        ],
        error: null,
      });
      await store.load(null);
      expect(store.rankings[0].userId).toBe('u1');
      expect(store.rankings[1].userId).toBe('u2');
    });

    it('Realtime 채널 구독', async () => {
      await store.load(null);
      expect(mockChannelSubscribe).toHaveBeenCalled();
    });

    it('재호출 시 기존 채널 정리 후 재구독', async () => {
      await store.load(null);
      await store.load(null);
      expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
      expect(mockChannelSubscribe).toHaveBeenCalledTimes(2);
    });
  });

  describe('broadcast 수신', () => {
    beforeEach(async () => {
      await store.load(null);
    });

    it('새 유저 broadcast → rankings에 추가', () => {
      triggerBroadcast({ userId: 'u1', displayName: '홍길동', maxRouteMeters: 300 });
      expect(store.rankings).toHaveLength(1);
      expect(store.rankings[0]).toMatchObject({ userId: 'u1', maxRouteMeters: 300, isLive: true });
    });

    it('기존 유저 broadcast → maxRouteMeters 업데이트', async () => {
      mockQuerySessions.mockResolvedValue({
        data: [{ user_id: 'u1', max_route_meters: 100 }],
        error: null,
      });
      mockQueryProfiles.mockResolvedValue({ data: [{ id: 'u1', display_name: '홍길동' }], error: null });
      await store.load(null);

      triggerBroadcast({ userId: 'u1', displayName: '홍길동', maxRouteMeters: 500 });
      expect(store.rankings[0].maxRouteMeters).toBe(500);
      expect(store.rankings[0].isLive).toBe(true);
    });

    it('broadcast 후 내림차순 재정렬', () => {
      triggerBroadcast({ userId: 'u2', displayName: 'B', maxRouteMeters: 100 });
      triggerBroadcast({ userId: 'u1', displayName: 'A', maxRouteMeters: 300 });
      expect(store.rankings[0].userId).toBe('u1');
    });
  });

  describe('dispose()', () => {
    it('채널이 있으면 removeChannel 호출', async () => {
      await store.load(null);
      store.dispose();
      expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it('채널 없이 dispose해도 에러 없음', () => {
      expect(() => store.dispose()).not.toThrow();
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/LeaderboardStore.test.ts
```
Expected: FAIL (파일 없음)

- [ ] **Step 3: LeaderboardStore 구현**

`src/stores/LeaderboardStore.ts`:
```typescript
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';

interface Ranking {
  userId: string;
  displayName: string;
  maxRouteMeters: number;
  isLive: boolean;
}

class LeaderboardStore {
  public rankings: Ranking[] = [];
  public loading: boolean = false;
  public error: string | null = null;
  private _channel: ReturnType<typeof supabase.channel> | null = null;

  constructor(private groupId: string) {
    makeAutoObservable(this);
  }

  async load(periodStartedAt: Date | null): Promise<void> {
    if (this._channel) {
      supabase.removeChannel(this._channel);
      this._channel = null;
    }

    runInAction(() => { this.loading = true; this.error = null; });

    try {
      let query = supabase
        .from('tracking_sessions')
        .select('user_id, max_route_meters')
        .eq('group_id', this.groupId);
      if (periodStartedAt) {
        query = query.gte('created_at', periodStartedAt.toISOString());
      }
      const { data: sessions, error: sessionsError } = await query;
      if (sessionsError) throw sessionsError;

      const maxByUser = new Map<string, number>();
      for (const row of sessions ?? []) {
        const prev = maxByUser.get(row.user_id) ?? 0;
        maxByUser.set(row.user_id, Math.max(prev, row.max_route_meters ?? 0));
      }

      const userIds = [...maxByUser.keys()];
      const nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds);
        for (const p of profiles ?? []) {
          nameMap.set(p.id, p.display_name);
        }
      }

      runInAction(() => {
        this.rankings = [...maxByUser.entries()]
          .map(([userId, maxRouteMeters]) => ({
            userId,
            displayName: nameMap.get(userId) ?? '알 수 없음',
            maxRouteMeters,
            isLive: false,
          }))
          .sort((a, b) => b.maxRouteMeters - a.maxRouteMeters);
        this.loading = false;
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : '순위 불러오기 실패';
        this.loading = false;
      });
      return;
    }

    const channel = supabase.channel(`group-progress:${this.groupId}`);
    channel.on('broadcast', { event: 'progress' }, (msg) => {
      const { userId, displayName, maxRouteMeters } = msg.payload as {
        userId: string;
        displayName: string;
        maxRouteMeters: number;
      };
      runInAction(() => {
        const existing = this.rankings.find((r) => r.userId === userId);
        if (existing) {
          existing.maxRouteMeters = maxRouteMeters;
          if (existing.displayName === '알 수 없음') existing.displayName = displayName;
          existing.isLive = true;
        } else {
          this.rankings.push({ userId, displayName, maxRouteMeters, isLive: true });
        }
        this.rankings.sort((a, b) => b.maxRouteMeters - a.maxRouteMeters);
      });
    });
    channel.subscribe();
    this._channel = channel;
  }

  dispose(): void {
    if (this._channel) {
      supabase.removeChannel(this._channel);
      this._channel = null;
    }
  }
}

export { LeaderboardStore };
export type { Ranking };
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run src/stores/LeaderboardStore.test.ts
```
Expected: ALL PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/LeaderboardStore.ts src/stores/LeaderboardStore.test.ts
git commit -m "feat: LeaderboardStore 추가 (DB + Realtime 순위)"
```

---

## Task 6: GroupMapPage 업데이트 (TDD)

**Files:**
- Modify: `src/pages/GroupMapPage.tsx`
- Modify: `src/pages/GroupMapPage.test.tsx`

- [ ] **Step 1: GroupMapPage.test.tsx에 mock 필드 + 테스트 추가**

`src/pages/GroupMapPage.test.tsx`에서 다음을 수정:

**① mockTrackingStore에 필드 추가:**
```typescript
    maxRouteMeters: 0,
    setRoutePoints: vi.fn(),
```

**② mockGroupMapStore에 필드 추가:**
```typescript
    isPeriodActive: false,
    periodStartedAt: null as Date | null,
    startPeriod: vi.fn(),
    endPeriod: vi.fn(),
```

**③ vi.hoisted 뒤에 mockLeaderboardStore 추가:**
```typescript
const { mockLeaderboardStore } = vi.hoisted(() => ({
  mockLeaderboardStore: {
    rankings: [] as { userId: string; displayName: string; maxRouteMeters: number; isLive: boolean }[],
    loading: false,
    error: null as string | null,
    load: vi.fn(),
    dispose: vi.fn(),
  },
}));

vi.mock('../stores/LeaderboardStore', () => ({
  LeaderboardStore: vi.fn(function () { return mockLeaderboardStore; }),
}));
```

**④ beforeEach에 추가:**
```typescript
    mockTrackingStore.maxRouteMeters = 0;
    mockGroupMapStore.isPeriodActive = false;
    mockGroupMapStore.periodStartedAt = null;
    mockLeaderboardStore.rankings = [];
    mockLeaderboardStore.loading = false;
    mockLeaderboardStore.load.mockResolvedValue(undefined);
```

**⑤ describe('칩 탭') 블록 추가:**
```typescript
  describe('칩 탭', () => {
    it('초기에 지도 탭이 활성 — map-container 표시', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /지도/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /순위/ })).toBeInTheDocument();
    });

    it('순위 탭 클릭 시 순위 패널 표시', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /순위/ }));
      expect(screen.getByTestId('leaderboard-panel')).toBeInTheDocument();
    });

    it('지도 탭 클릭 시 지도 컨테이너 표시', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /지도/ }));
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });
```

**⑥ describe('관리자 기간 버튼') 블록 추가:**
```typescript
  describe('관리자 기간 버튼', () => {
    it('관리자 + 기간 비활성 — "활동 시작" 버튼 표시', async () => {
      mockGroupMapStore.isPeriodActive = false;
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /활동 시작/ })).toBeInTheDocument();
      });
    });

    it('관리자 + 기간 활성 — "활동 시작" 버튼 미표시', async () => {
      mockGroupMapStore.isPeriodActive = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByTestId('map-container'));
      expect(screen.queryByRole('button', { name: /활동 시작/ })).not.toBeInTheDocument();
    });

    it('"활동 시작" 클릭 시 startPeriod() 호출', async () => {
      mockGroupMapStore.isPeriodActive = false;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /활동 시작/ }));
      fireEvent.click(screen.getByRole('button', { name: /활동 시작/ }));
      expect(mockGroupMapStore.startPeriod).toHaveBeenCalledOnce();
    });

    it('멤버에게 "활동 시작" 버튼 미표시', async () => {
      mockGroupMapStore.currentUserId = 'other-user';
      mockGroupMapStore.isPeriodActive = false;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByTestId('map-container'));
      expect(screen.queryByRole('button', { name: /활동 시작/ })).not.toBeInTheDocument();
    });

    it('순위 탭 + 기간 활성 + 관리자 — "활동 종료" 버튼 표시', async () => {
      mockGroupMapStore.isPeriodActive = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /순위/ }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /활동 종료/ })).toBeInTheDocument();
      });
    });
  });
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```
Expected: FAIL (칩 탭 없음, 관리자 버튼 없음, LeaderboardStore mock 없음)

- [ ] **Step 3: GroupMapPage.tsx 전체 교체**

`src/pages/GroupMapPage.tsx`:
```typescript
import { useRef, useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { Button } from '@/components/ui/button';
import { Crosshair } from 'lucide-react';
import { MapStore } from '../stores/MapStore';
import { GroupMapStore } from '../stores/GroupMapStore';
import { TrackingStore } from '../stores/TrackingStore';
import { LeaderboardStore } from '../stores/LeaderboardStore';
import { parseGpxPoints } from '../utils/routeProjection';
import type { Ranking } from '../stores/LeaderboardStore';

export const GroupMapPage = observer(() => {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapStore] = useState(() => new MapStore());
  const [store] = useState(() => new GroupMapStore(navigate));
  const [trackingStore] = useState(() => new TrackingStore(id!, []));
  const [leaderboardStore] = useState(() => new LeaderboardStore(id!));
  const [activeTab, setActiveTab] = useState<'map' | 'leaderboard'>('map');

  const routePoints = useMemo(
    () => (store.gpxText ? parseGpxPoints(store.gpxText) : []),
    [store.gpxText]
  );

  // Effect 1: 데이터 fetch
  useEffect(() => {
    if (!id) return;
    return store.load(id);
  }, [store, id]);

  // Effect 2: 지도 초기화 + GPX 렌더링
  useEffect(() => {
    if (!mapRef.current || store.gpxText === undefined || store.group === undefined || store.group === null) {
      return () => { mapStore.destroy(); };
    }

    mapStore.initMap(mapRef.current);
    mapStore.startWatchingLocation((lat, lng) => trackingStore.addPoint(lat, lng));

    if (store.gpxText !== null) {
      mapStore.drawGpxRoute(store.gpxText);
    } else {
      runInAction(() => { mapStore.error = true; });
    }

    return () => { mapStore.destroy(); };
  }, [mapStore, trackingStore, store.gpxText, store.group]);

  // Effect 3: TrackingStore routePoints 주입
  useEffect(() => {
    if (routePoints.length > 0) trackingStore.setRoutePoints(routePoints);
  }, [trackingStore, routePoints]);

  // Effect 4: LeaderboardStore 로드
  useEffect(() => {
    if (store.group !== undefined && store.gpxText !== undefined) {
      void leaderboardStore.load(store.periodStartedAt ?? null);
    }
  }, [leaderboardStore, store.group, store.gpxText, store.periodStartedAt]);

  // Effect 5: TrackingStore 정리
  useEffect(() => {
    return () => { trackingStore.dispose(); };
  }, [trackingStore]);

  // Effect 6: LeaderboardStore 정리
  useEffect(() => {
    return () => { leaderboardStore.dispose(); };
  }, [leaderboardStore]);

  if (store.group === null) return <Navigate to="/group" replace />;

  if (store.group === undefined || store.gpxText === undefined) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div
          role="status"
          className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"
        />
      </div>
    );
  }

  const isAdmin = store.currentUserId === store.group.created_by;
  const bottomOffset = (trackingStore.isTracking || trackingStore.saving) ? 'bottom-36' : 'bottom-20';

  return (
    <div className="absolute inset-0">
      {/* 네이버 지도 컨테이너 */}
      <div
        ref={mapRef}
        data-testid="map-container"
        className="absolute inset-0 w-full h-full"
      />

      {/* 에러 오버레이 */}
      {mapStore.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
          <p className="text-sm text-neutral-500">지도를 불러올 수 없습니다</p>
        </div>
      )}

      {/* 코스로 돌아가기 버튼 */}
      {mapStore.map && !mapStore.isCourseVisible && (
        <div className={`absolute ${bottomOffset} left-1/2 -translate-x-1/2 z-10`}>
          <button
            onClick={() => mapStore.returnToCourse()}
            className="bg-white/90 text-black px-4 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap"
          >
            코스로 돌아가기
          </button>
        </div>
      )}

      {/* 내 위치 버튼 */}
      {mapStore.map && (
        <div className={`absolute right-3 ${bottomOffset} z-10`}>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => mapStore.locate()}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); mapStore.locate(); }}
            aria-label="내 위치"
            className="bg-white hover:bg-neutral-50 shadow-md"
          >
            <Crosshair size={18} className="text-neutral-700" />
          </Button>
        </div>
      )}

      {/* 트래킹 시작 버튼 + 관리자 활동 시작 버튼 (지도 탭, 미추적 중) */}
      {!trackingStore.isTracking && !trackingStore.saving && activeTab === 'map' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
          {isAdmin && !store.isPeriodActive && (
            <button
              onClick={() => void store.startPeriod()}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); void store.startPeriod(); }}
              className="bg-green-500 text-white px-6 py-2 rounded-full text-sm font-semibold shadow-lg"
            >
              ▶ 활동 시작
            </button>
          )}
          <button
            onClick={() => trackingStore.start()}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); trackingStore.start(); }}
            className="bg-black text-white px-8 py-3 rounded-full text-sm font-semibold shadow-lg"
          >
            ● 시작
          </button>
        </div>
      )}

      {/* 트래킹 중 통계 패널 */}
      {(trackingStore.isTracking || trackingStore.saving) && (
        <div className="absolute bottom-6 left-4 right-4 z-10 bg-white/90 rounded-2xl shadow-lg px-4 py-3">
          <div className="flex justify-around text-center mb-2">
            <div>
              <p className="text-base font-semibold tabular-nums">{trackingStore.formattedTime}</p>
              <p className="text-xs text-neutral-500">시간</p>
            </div>
            <div>
              <p className="text-base font-semibold tabular-nums">{trackingStore.formattedDistance}</p>
              <p className="text-xs text-neutral-500">거리</p>
            </div>
            <div>
              <p className="text-base font-semibold tabular-nums">{trackingStore.formattedSpeed}</p>
              <p className="text-xs text-neutral-500">속도</p>
            </div>
          </div>
          <button
            onClick={() => trackingStore.stop()}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); trackingStore.stop(); }}
            disabled={trackingStore.saving}
            className={`w-full py-2 rounded-xl text-sm font-semibold ${
              trackingStore.saving
                ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                : 'bg-red-500 text-white'
            }`}
          >
            {trackingStore.saving ? '저장 중...' : '■ 중지'}
          </button>
        </div>
      )}

      {/* 순위 패널 (순위 탭) */}
      {activeTab === 'leaderboard' && (
        <div data-testid="leaderboard-panel" className="absolute bottom-6 left-4 right-4 top-20 z-10 bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
          <div className={`px-4 py-2 text-xs font-semibold ${store.isPeriodActive ? 'bg-green-500 text-white' : 'bg-neutral-200 text-neutral-500'}`}>
            {store.isPeriodActive
              ? '● 활동 중 · 1초마다 갱신'
              : store.periodStartedAt
                ? `활동 기간: ${store.periodStartedAt.toLocaleDateString()} ~ ${store.periodEndedAt?.toLocaleDateString() ?? ''}`
                : '활동 기간이 없습니다'}
          </div>
          <div className="flex-1 overflow-y-auto">
            {leaderboardStore.loading && (
              <div className="flex justify-center py-8">
                <div role="status" className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
              </div>
            )}
            {!leaderboardStore.loading && leaderboardStore.rankings.map((r: Ranking, i: number) => (
              <div
                key={r.userId}
                className={`flex items-center px-4 py-3 border-b border-neutral-100 ${r.userId === store.currentUserId ? 'bg-blue-50' : ''}`}
              >
                <span className="w-7 font-bold text-base">{i + 1}</span>
                <span className="flex-1 text-sm font-medium">{r.displayName}</span>
                <span className="text-xs text-neutral-500 mr-2">
                  {r.maxRouteMeters >= 1000
                    ? `${(r.maxRouteMeters / 1000).toFixed(1)}km`
                    : `${Math.round(r.maxRouteMeters)}m`}
                </span>
                {r.isLive && <span className="text-xs text-red-500">● 라이브</span>}
              </div>
            ))}
            {!leaderboardStore.loading && leaderboardStore.rankings.length === 0 && (
              <p className="text-center text-sm text-neutral-400 py-8">아직 기록이 없습니다</p>
            )}
          </div>
          {isAdmin && store.isPeriodActive && (
            <div className="p-3">
              <button
                onClick={() => void store.endPeriod()}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); void store.endPeriod(); }}
                className="w-full bg-red-500 text-white py-2 rounded-xl text-sm font-semibold"
              >
                ■ 활동 종료
              </button>
            </div>
          )}
        </div>
      )}

      {/* 칩 탭 */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        <button
          onClick={() => setActiveTab('map')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold ${activeTab === 'map' ? 'bg-white text-black' : 'bg-white/40 text-white'}`}
        >
          🗺 지도
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold ${activeTab === 'leaderboard' ? 'bg-white text-black' : 'bg-white/40 text-white'}`}
        >
          🏆 순위
        </button>
      </div>

      {/* 뒤로가기 버튼 */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => navigate('/group')}
          className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
        >
          ← {store.group.name}
        </button>
      </div>

      {/* 설정 버튼 (소유자 전용) */}
      {store.currentUserId && store.group && store.currentUserId === store.group.created_by && (
        <div className="absolute top-4 right-4 z-10">
          <a
            href={`/group/${id}/settings`}
            aria-label="설정"
            className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
          >
            ⚙ 설정
          </a>
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 4: GroupMapPage 테스트 통과 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```
Expected: ALL PASS

- [ ] **Step 5: 전체 테스트 통과 확인**

```bash
npx vitest run
```
Expected: ALL PASS

- [ ] **Step 6: 커밋**

```bash
git add src/pages/GroupMapPage.tsx src/pages/GroupMapPage.test.tsx
git commit -m "feat: GroupMapPage 칩 탭, 리더보드 패널, 관리자 활동 기간 버튼 추가"
```

---

## Task 7: ProfileStore + ProfilePage 업데이트 (TDD)

**Files:**
- Create: `src/stores/ProfileStore.ts`
- Create: `src/stores/ProfileStore.test.ts`
- Modify: `src/pages/ProfilePage.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/ProfileStore.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileStore } from './ProfileStore';
import { toast } from 'sonner';

const { mockGetUser, mockSelectProfile, mockUpsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectProfile: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: () => mockSelectProfile() }) }),
          upsert: (...args: unknown[]) => mockUpsert(...args),
        };
      }
      return {};
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('ProfileStore', () => {
  let store: ProfileStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new ProfileStore();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  describe('초기 상태', () => {
    it('displayName이 ""', () => {
      expect(store.displayName).toBe('');
    });

    it('loading이 false', () => {
      expect(store.loading).toBe(false);
    });

    it('saving이 false', () => {
      expect(store.saving).toBe(false);
    });
  });

  describe('load()', () => {
    it('프로필 있으면 displayName 설정', async () => {
      mockSelectProfile.mockResolvedValue({ data: { display_name: '홍길동' }, error: null });
      await store.load();
      expect(store.displayName).toBe('홍길동');
    });

    it('프로필 없으면 displayName 빈 문자열', async () => {
      mockSelectProfile.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      await store.load();
      expect(store.displayName).toBe('');
    });
  });

  describe('save()', () => {
    it('upsert 호출', async () => {
      mockUpsert.mockResolvedValue({ error: null });
      await store.save('테스트이름');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: '테스트이름' }),
        expect.anything()
      );
    });

    it('성공 시 displayName 업데이트 + toast.success', async () => {
      mockUpsert.mockResolvedValue({ error: null });
      await store.save('새이름');
      expect(store.displayName).toBe('새이름');
      expect(toast.success).toHaveBeenCalled();
    });

    it('실패 시 toast.error', async () => {
      mockUpsert.mockResolvedValue({ error: { message: '저장 실패' } });
      await store.save('이름');
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/ProfileStore.test.ts
```
Expected: FAIL

- [ ] **Step 3: ProfileStore 구현**

`src/stores/ProfileStore.ts`:
```typescript
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

class ProfileStore {
  public displayName: string = '';
  public loading: boolean = false;
  public saving: boolean = false;

  constructor() {
    makeAutoObservable(this);
  }

  async load(): Promise<void> {
    runInAction(() => { this.loading = true; });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
      runInAction(() => {
        this.displayName = data?.display_name ?? '';
        this.loading = false;
      });
    } catch {
      runInAction(() => { this.loading = false; });
    }
  }

  async save(displayName: string): Promise<void> {
    runInAction(() => { this.saving = true; });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('미인증');
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, display_name: displayName }, { onConflict: 'id' });
      if (error) throw error;
      runInAction(() => {
        this.displayName = displayName;
        this.saving = false;
      });
      toast.success('프로필이 저장되었습니다');
    } catch {
      runInAction(() => { this.saving = false; });
      toast.error('프로필 저장에 실패했습니다');
    }
  }
}

export { ProfileStore };
```

- [ ] **Step 4: ProfilePage 업데이트**

`src/pages/ProfilePage.tsx`:
```typescript
import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { AuthStore } from '../stores/AuthStore';
import { ProfileStore } from '../stores/ProfileStore';

export const ProfilePage = observer(() => {
  const [authStore] = useState(() => new AuthStore());
  const [profileStore] = useState(() => new ProfileStore());
  const [inputValue, setInputValue] = useState('');

  useEffect(() => authStore.initialize(), [authStore]);
  useEffect(() => {
    profileStore.load().then(() => {
      setInputValue(profileStore.displayName);
    });
  }, [profileStore]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-white px-6">
      <p className="text-lg font-semibold">프로필</p>

      <div className="w-full max-w-xs flex flex-col gap-2">
        <label className="text-sm text-neutral-500">닉네임</label>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="표시될 이름을 입력하세요"
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <Button
          onClick={() => void profileStore.save(inputValue)}
          disabled={profileStore.saving || !inputValue.trim()}
          className="w-full"
        >
          {profileStore.saving ? '저장 중...' : '저장'}
        </Button>
      </div>

      <Button variant="outline" onClick={() => authStore.signOut()}>
        로그아웃
      </Button>
    </div>
  );
});
```

- [ ] **Step 5: ProfileStore 테스트 통과 확인**

```bash
npx vitest run src/stores/ProfileStore.test.ts
```
Expected: ALL PASS

- [ ] **Step 6: 전체 테스트 통과 확인**

```bash
npx vitest run
```
Expected: ALL PASS

- [ ] **Step 7: 커밋**

```bash
git add src/stores/ProfileStore.ts src/stores/ProfileStore.test.ts src/pages/ProfilePage.tsx
git commit -m "feat: ProfileStore + ProfilePage display_name 설정 추가"
```
