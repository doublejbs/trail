# Tracking Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 트래킹 중지 시 세션 기록(시간, 거리, GPS 포인트)을 Supabase에 자동 저장한다.

**Architecture:** `TrackingStore`에 `groupId` 생성자 파라미터와 `_save()` 비동기 메서드를 추가해 `stop()` 호출 시 fire-and-forget으로 INSERT. GroupMapPage는 `id!`를 TrackingStore에 전달하고, 저장 중에는 패널을 유지(`isTracking || saving`)한다.

**Tech Stack:** TypeScript, MobX 6, Supabase JS SDK, Vitest, React Testing Library, sonner (toast)

**Spec:** `docs/superpowers/specs/2026-03-22-tracking-save-design.md`

---

## File Map

| File | Role |
|------|------|
| `supabase/migrations/20260322000001_tracking_sessions.sql` | 새 마이그레이션 — 테이블 + RLS + 인덱스 |
| `src/types/trackingSession.ts` | 새 파일 — TypeScript 인터페이스 |
| `src/stores/TrackingStore.ts` | groupId 파라미터, saving/saveError, _save(), stop() 수정 |
| `src/stores/TrackingStore.test.ts` | 기존 테스트 수정 + 저장 테스트 추가 |
| `src/pages/GroupMapPage.tsx` | id! 전달, isTracking\|\|saving 조건, 중지 버튼 disabled |
| `src/pages/GroupMapPage.test.tsx` | saving 상태 테스트 추가 |

---

## Task 1: DB 마이그레이션 및 TypeScript 타입

**Files:**
- Create: `supabase/migrations/20260322000001_tracking_sessions.sql`
- Create: `src/types/trackingSession.ts`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260322000001_tracking_sessions.sql`:
```sql
-- ============================================================
-- tracking_sessions 테이블
-- ============================================================
CREATE TABLE tracking_sessions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id        UUID          NOT NULL REFERENCES groups(id)     ON DELETE CASCADE,
  elapsed_seconds INT           NOT NULL,
  distance_meters NUMERIC(10,2) NOT NULL,
  points          JSONB         NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- 리더보드 쿼리용 인덱스
CREATE INDEX ON tracking_sessions (group_id, user_id);

-- RLS 활성화
ALTER TABLE tracking_sessions ENABLE ROW LEVEL SECURITY;

-- INSERT: 자신의 기록만 삽입
CREATE POLICY "user can insert own sessions"
  ON tracking_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- SELECT용 SECURITY DEFINER 함수 (RLS 재귀 방지)
-- group_members → tracking_sessions 서브쿼리가 group_members RLS를 재귀 호출하는 것을 막음
CREATE OR REPLACE FUNCTION is_group_member(gid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid AND user_id = auth.uid()
  );
$$;

-- SELECT: 같은 그룹 멤버의 기록 조회 가능
CREATE POLICY "group member can view sessions"
  ON tracking_sessions FOR SELECT
  USING (is_group_member(group_id));
```

- [ ] **Step 2: TypeScript 타입 파일 작성**

`src/types/trackingSession.ts`:
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

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260322000001_tracking_sessions.sql src/types/trackingSession.ts
git commit -m "feat: tracking_sessions 테이블 마이그레이션 및 타입 추가"
```

---

## Task 2: TrackingStore — 저장 기능 추가

**Files:**
- Modify: `src/stores/TrackingStore.ts`
- Modify: `src/stores/TrackingStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/TrackingStore.test.ts` 상단 import 뒤에 supabase/sonner mock 추가 (기존 import 유지):

```typescript
const { mockGetUser, mockInsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: () => ({ insert: (...args: unknown[]) => mockInsert(...args) }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
```

기존 `beforeEach`의 `store = new TrackingStore()` → `store = new TrackingStore('test-group-id')` 로 변경.

`describe('TrackingStore')` 블록 안에 다음 describe 추가:

```typescript
  describe('저장 기능', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      mockInsert.mockResolvedValue({ error: null });
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

    it('stop() 후 elapsedSeconds === 0이면 INSERT 미호출', async () => {
      store.start();
      store.stop();
      await vi.runAllTimersAsync();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('저장 중 saving === true', async () => {
      mockInsert.mockImplementation(() => new Promise(() => {})); // 영원히 pending
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await Promise.resolve(); // microtask flush
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/TrackingStore.test.ts
```
Expected: FAIL (groupId 파라미터 없음, saving/saveError 없음)

- [ ] **Step 3: TrackingStore 전체 교체**

`src/stores/TrackingStore.ts`:

```typescript
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

class TrackingStore {
  public isTracking: boolean = false;
  public elapsedSeconds: number = 0;
  public distanceMeters: number = 0;
  public speedKmh: number = 0;
  public points: { lat: number; lng: number; ts: number }[] = [];
  public saving: boolean = false;
  public saveError: string | null = null;

  private timerId: ReturnType<typeof setInterval> | null = null;

  public constructor(private groupId: string) {
    makeAutoObservable(this);
  }

  public start(): void {
    this._clearTimer();
    this.isTracking = true;
    this.elapsedSeconds = 0;
    this.distanceMeters = 0;
    this.speedKmh = 0;
    this.points = [];
    this.saveError = null;
    this.timerId = setInterval(() => {
      runInAction(() => { this.elapsedSeconds += 1; });
    }, 1000);
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

  private async _save(): Promise<void> {
    runInAction(() => { this.saving = true; this.saveError = null; });
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
git commit -m "feat: TrackingStore groupId 파라미터 및 저장 기능 추가"
```

---

## Task 3: GroupMapPage — saving 상태 반영

**Files:**
- Modify: `src/pages/GroupMapPage.tsx`
- Modify: `src/pages/GroupMapPage.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`src/pages/GroupMapPage.test.tsx`의 `mockTrackingStore` 객체에 `saving: false` 추가:

```typescript
  // 기존 mockTrackingStore에 아래 필드 추가
  saving: false,
  saveError: null as string | null,
```

`beforeEach`에 추가:
```typescript
    mockTrackingStore.saving = false;
    mockTrackingStore.saveError = null;
```

`describe('트래킹 UI')` 블록 끝에 아래 테스트 추가:

```typescript
    it('saving 중 통계 패널 유지', async () => {
      mockTrackingStore.isTracking = false;
      mockTrackingStore.saving = true;
      mockTrackingStore.formattedTime = '00:00:05';
      mockTrackingStore.formattedDistance = '0m';
      mockTrackingStore.formattedSpeed = '0.0km/h';
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByText('00:00:05')).toBeInTheDocument();
      });
    });

    it('saving 중 중지 버튼 disabled', async () => {
      mockTrackingStore.isTracking = false;
      mockTrackingStore.saving = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /저장 중/ })).toBeDisabled();
      });
    });
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```
Expected: FAIL (saving 상태 처리 없음, TrackingStore 생성자 인자 변경 필요)

- [ ] **Step 3: GroupMapPage 수정**

`src/pages/GroupMapPage.tsx`에서 다음 두 곳을 수정:

1. TrackingStore 인스턴스화 (line 17):
```typescript
  const [trackingStore] = useState(() => new TrackingStore(id ?? ''));
```

2. `bottomOffset` 계산 (line 61):
```typescript
  const bottomOffset = (trackingStore.isTracking || trackingStore.saving) ? 'bottom-36' : 'bottom-20';
```

3. 통계 패널 렌더링 조건 (line 121):
```typescript
      {(trackingStore.isTracking || trackingStore.saving) && (
```

4. 중지 버튼 (line 137-143) — saving 중 disabled 처리:
```typescript
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
```

- [ ] **Step 4: 전체 테스트 통과 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```
Expected: ALL PASS

- [ ] **Step 5: 전체 테스트 suite 확인**

```bash
npx vitest run
```
Expected: 모든 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/pages/GroupMapPage.tsx src/pages/GroupMapPage.test.tsx
git commit -m "feat: GroupMapPage saving 상태 반영 (패널 유지, 버튼 disabled)"
```
