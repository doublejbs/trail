# Tracking Pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "■ 중지" 버튼을 "⏸ 일시정지"로 교체하고, 일시정지 상태에서 "▶ 재개" + "■ 종료" 버튼을 제공한다.

**Architecture:** TrackingStore에 `isPaused: boolean` 필드를 추가하고, `_startTimer()` 헬퍼로 타이머 로직을 추출해 `pause()`/`resume()`에서 공유한다. GroupMapPage 버튼 영역을 `isPaused` 상태에 따라 3-way 분기한다.

**Tech Stack:** React 19, TypeScript, MobX 6 (`makeAutoObservable`), Vitest + React Testing Library

---

## 파일 구조

- **Modify:** `src/stores/TrackingStore.ts` — `isPaused` 필드, `_startTimer()` 헬퍼, `pause()`/`resume()` 추가
- **Modify:** `src/stores/TrackingStore.test.ts` — 기존 "재호출 시 상태 리셋" 수정, 새 테스트 추가
- **Modify:** `src/pages/GroupMapPage.tsx` — 버튼 영역 3-way 분기
- **Modify:** `src/pages/GroupMapPage.test.tsx` — mock 업데이트 + 새 테스트 추가

---

## Task 1: TrackingStore — isPaused + pause/resume

**Files:**
- Modify: `src/stores/TrackingStore.ts`
- Modify: `src/stores/TrackingStore.test.ts`

### 배경

현재 `TrackingStore`의 `start()` 메서드는 재호출 시 상태를 리셋한다. 이 동작을 "이미 트래킹 중이면 무시"로 변경한다. 또 타이머 시작 로직을 `_startTimer()` private 메서드로 추출해 `resume()`에서 재사용한다.

**중요 주의사항:**
- `makeAutoObservable(this)`로 등록된 public 메서드는 자동으로 MobX action이 된다. action 컨텍스트 안에서는 observable 필드를 직접 수정할 수 있으며, `runInAction()` 없이도 된다.
- `setInterval` 콜백은 action 컨텍스트 밖이므로 `runInAction()` 필수.
- TypeScript `erasableSyntaxOnly` 규칙 때문에 `constructor(private x: string)` 축약 문법 금지. 반드시 `private x: string;` 필드 선언 + `this.x = x;` 할당 방식 사용.
- 모든 문장은 세미콜론(`;`)으로 끝낸다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/TrackingStore.test.ts`에서:

1. 기존 `it('재호출 시 상태 리셋', ...)` 테스트를 **제거**하고 아래 테스트로 교체:
```typescript
it('이미 트래킹 중이면 재호출 시 무시', () => {
  store.start();
  vi.advanceTimersByTime(5000);
  store.start(); // should be ignored
  expect(store.elapsedSeconds).toBe(5);
  expect(store.isTracking).toBe(true);
});
```

2. `describe('초기 상태')` 블록에 추가:
```typescript
it('isPaused가 false', () => {
  expect(store.isPaused).toBe(false);
});
```

3. `describe('stop()')` 블록에 추가:
```typescript
it('stop() 후 isPaused가 false로 초기화', () => {
  store.start();
  store.pause();
  store.stop();
  expect(store.isPaused).toBe(false);
});
```

4. 파일 끝(broadcast describe 이전)에 다음 describe 블록 추가:
```typescript
describe('pause()', () => {
  it('트래킹 중 — isPaused를 true로 설정', () => {
    store.start();
    store.pause();
    expect(store.isPaused).toBe(true);
  });

  it('pause 후 타이머 정지 — elapsedSeconds 증가 안함', () => {
    store.start();
    vi.advanceTimersByTime(1000);
    store.pause();
    vi.advanceTimersByTime(2000);
    expect(store.elapsedSeconds).toBe(1);
  });

  it('isTracking이 false이면 무시', () => {
    store.pause();
    expect(store.isPaused).toBe(false);
  });

  it('이미 일시정지 중이면 재호출 시 무시', () => {
    store.start();
    store.pause();
    store.pause();
    expect(store.isPaused).toBe(true);
  });
});

describe('resume()', () => {
  it('일시정지 중 — isPaused를 false로 설정', () => {
    store.start();
    store.pause();
    store.resume();
    expect(store.isPaused).toBe(false);
  });

  it('resume 후 타이머 재시작 — elapsedSeconds 다시 증가', () => {
    store.start();
    vi.advanceTimersByTime(1000);
    store.pause();
    vi.advanceTimersByTime(2000);
    store.resume();
    vi.advanceTimersByTime(1000);
    expect(store.elapsedSeconds).toBe(2); // pause 중 증가 안했으므로 1 + 1
  });

  it('isTracking이 false이면 무시', () => {
    store.resume();
    expect(store.isPaused).toBe(false);
  });

  it('일시정지 아닐 때 재호출 시 무시', () => {
    store.start();
    store.resume(); // isPaused=false 상태에서 호출
    expect(store.isTracking).toBe(true); // 상태 변화 없음
  });
});

describe('일시정지 중 addPoint()', () => {
  it('isPaused이면 포인트 무시', () => {
    store.start();
    store.addPoint(37.5, 126.9);
    store.pause();
    store.addPoint(37.501, 126.9);
    expect(store.points).toHaveLength(1);
  });

  it('resume 후 addPoint() 정상 추가', () => {
    store.start();
    store.addPoint(37.5, 126.9);
    store.pause();
    store.resume();
    store.addPoint(37.501, 126.9);
    expect(store.points).toHaveLength(2);
  });
});

describe('일시정지 중 stop()', () => {
  it('일시정지 상태에서 stop() 시 정상 저장', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user-1@test.com' } }, error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockProfileSelect.mockResolvedValue({ data: null });
    mockChannelSubscribe.mockReturnValue(undefined);
    mockChannelSend.mockResolvedValue({});
    store.start();
    vi.advanceTimersByTime(2000);
    store.pause();
    store.stop();
    await vi.runAllTimersAsync();
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ elapsed_seconds: 2 })
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/TrackingStore.test.ts
```

Expected: 여러 테스트 FAIL — `isPaused` 필드 없음, `pause`/`resume` 메서드 없음

- [ ] **Step 3: TrackingStore 구현**

`src/stores/TrackingStore.ts`를 아래 전체 코드로 교체:

```typescript
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { haversineMeters, maxRouteProgress } from '../utils/routeProjection';

class TrackingStore {
  public isTracking: boolean = false;
  public isPaused: boolean = false;
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
  private groupId: string;
  private routePoints: { lat: number; lng: number }[];

  public constructor(
    groupId: string,
    routePoints: { lat: number; lng: number }[]
  ) {
    this.groupId = groupId;
    this.routePoints = routePoints;
    makeAutoObservable(this);
  }

  public setRoutePoints(points: { lat: number; lng: number }[]): void {
    this.routePoints = points;
  }

  public start(): void {
    if (this.isTracking) return;
    this._clearTimer();
    this.isTracking = true;
    this.isPaused = false;
    this.elapsedSeconds = 0;
    this.distanceMeters = 0;
    this.speedKmh = 0;
    this.points = [];
    this.saveError = null;
    this.maxRouteMeters = 0;
    this._startTimer();
    void this._initBroadcast();
  }

  public pause(): void {
    if (!this.isTracking || this.isPaused) return;
    this._clearTimer();
    this.isPaused = true;
  }

  public resume(): void {
    if (!this.isTracking || !this.isPaused) return;
    this.isPaused = false;
    this._startTimer();
  }

  public stop(): void {
    this._clearTimer();
    this.isTracking = false;
    this.isPaused = false;
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
    if (this.isPaused) return;
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

  private _startTimer(): void {
    this._clearTimer();
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

Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/TrackingStore.ts src/stores/TrackingStore.test.ts
git commit -m "feat: TrackingStore 일시정지/재개 기능 추가"
```

---

## Task 2: GroupMapPage — 일시정지/재개 UI

**Files:**
- Modify: `src/pages/GroupMapPage.tsx`
- Modify: `src/pages/GroupMapPage.test.tsx`

### 배경

`GroupMapPage`의 트래킹 중 통계 패널 하단 버튼 영역을 `trackingStore.isPaused` 상태에 따라 분기한다:
- `!isPaused && !saving` → "⏸ 일시정지" 버튼
- `isPaused` → "▶ 재개" + "■ 종료" 버튼 (가로 배치)
- `saving` → "저장 중..." 비활성 버튼 (기존)

기존 "중지 버튼" 테스트들이 더 이상 유효하지 않으므로 교체가 필요하다.

- [ ] **Step 1: GroupMapPage.test.tsx — mock 업데이트 및 실패하는 테스트 작성**

1. `mockTrackingStore` hoisted 객체에 필드 추가 (line ~60):
```typescript
const { mockTrackingStore } = vi.hoisted(() => ({
  mockTrackingStore: {
    isTracking: false,
    isPaused: false,          // 추가
    elapsedSeconds: 0,
    distanceMeters: 0,
    speedKmh: 0,
    formattedTime: '00:00:00',
    formattedDistance: '0m',
    formattedSpeed: '0.0km/h',
    saving: false,
    saveError: null as string | null,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),           // 추가
    resume: vi.fn(),          // 추가
    addPoint: vi.fn(),
    dispose: vi.fn(),
    maxRouteMeters: 0,
    setRoutePoints: vi.fn(),
  },
}));
```

2. `beforeEach` 블록에 추가 (mockTrackingStore 초기화 부분):
```typescript
mockTrackingStore.isPaused = false;
```

3. `describe('트래킹 UI')` 블록에서 다음 기존 테스트들을 **제거**하고 새 테스트로 교체:
- 제거: `it('트래킹 중 — 중지 버튼 표시', ...)`
- 제거: `it('중지 버튼 클릭 시 trackingStore.stop() 호출', ...)`
- 교체: `it('트래킹 중 — 시작 버튼 미표시', ...)` — anchor 수정만

**교체 — "트래킹 중 — 중지 버튼 표시"** (기존 삭제 후 아래로 교체):
```typescript
it('트래킹 중(미일시정지) — 일시정지 버튼 표시', async () => {
  mockTrackingStore.isTracking = true;
  mockTrackingStore.isPaused = false;
  renderAt('/group/group-uuid-1');
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /⏸ 일시정지/ })).toBeInTheDocument();
  });
});
```

**교체 — "중지 버튼 클릭 시 trackingStore.stop() 호출"** (기존 삭제 후 아래로 교체):
```typescript
it('일시정지 버튼 클릭 시 trackingStore.pause() 호출', async () => {
  mockTrackingStore.isTracking = true;
  mockTrackingStore.isPaused = false;
  renderAt('/group/group-uuid-1');
  await waitFor(() => screen.getByRole('button', { name: /⏸ 일시정지/ }));
  fireEvent.click(screen.getByRole('button', { name: /⏸ 일시정지/ }));
  expect(mockTrackingStore.pause).toHaveBeenCalledOnce();
});
```

**교체 — "트래킹 중 — 시작 버튼 미표시"** (anchor 수정):
```typescript
it('트래킹 중 — 시작 버튼 미표시', async () => {
  mockTrackingStore.isTracking = true;
  renderAt('/group/group-uuid-1');
  await waitFor(() => screen.getByRole('button', { name: /⏸ 일시정지/ }));
  expect(screen.queryByRole('button', { name: /● 시작/ })).not.toBeInTheDocument();
});
```

**추가 — 일시정지 UI 테스트**:
```typescript
it('일시정지 중 — 재개 + 종료 버튼 표시', async () => {
  mockTrackingStore.isTracking = true;
  mockTrackingStore.isPaused = true;
  renderAt('/group/group-uuid-1');
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /▶ 재개/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /■ 종료/ })).toBeInTheDocument();
  });
});

it('재개 버튼 클릭 시 trackingStore.resume() 호출', async () => {
  mockTrackingStore.isTracking = true;
  mockTrackingStore.isPaused = true;
  renderAt('/group/group-uuid-1');
  await waitFor(() => screen.getByRole('button', { name: /▶ 재개/ }));
  fireEvent.click(screen.getByRole('button', { name: /▶ 재개/ }));
  expect(mockTrackingStore.resume).toHaveBeenCalledOnce();
});

it('종료 버튼 클릭 시 trackingStore.stop() 호출', async () => {
  mockTrackingStore.isTracking = true;
  mockTrackingStore.isPaused = true;
  renderAt('/group/group-uuid-1');
  await waitFor(() => screen.getByRole('button', { name: /■ 종료/ }));
  fireEvent.click(screen.getByRole('button', { name: /■ 종료/ }));
  expect(mockTrackingStore.stop).toHaveBeenCalledOnce();
});

it('일시정지 중 — 일시정지 버튼 미표시', async () => {
  mockTrackingStore.isTracking = true;
  mockTrackingStore.isPaused = true;
  renderAt('/group/group-uuid-1');
  await waitFor(() => screen.getByRole('button', { name: /▶ 재개/ }));
  expect(screen.queryByRole('button', { name: /⏸ 일시정지/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```

Expected: 새로 추가한 테스트들 FAIL

- [ ] **Step 3: GroupMapPage.tsx — 버튼 영역 교체**

`src/pages/GroupMapPage.tsx`에서 트래킹 중 통계 패널 내 버튼 영역만 교체한다 (나머지 코드는 그대로).

현재 코드 (line ~174-186):
```tsx
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

교체 후:
```tsx
{trackingStore.saving && (
  <button
    disabled
    className="w-full py-2 rounded-xl text-sm font-semibold bg-neutral-300 text-neutral-500 cursor-not-allowed"
  >
    저장 중...
  </button>
)}
{!trackingStore.saving && !trackingStore.isPaused && (
  <button
    onClick={() => trackingStore.pause()}
    onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); trackingStore.pause(); }}
    className="w-full py-2 rounded-xl text-sm font-semibold bg-neutral-400 text-white"
  >
    ⏸ 일시정지
  </button>
)}
{!trackingStore.saving && trackingStore.isPaused && (
  <div className="flex gap-2">
    <button
      onClick={() => trackingStore.resume()}
      onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); trackingStore.resume(); }}
      className="flex-1 py-2 rounded-xl text-sm font-semibold bg-black text-white"
    >
      ▶ 재개
    </button>
    <button
      onClick={() => trackingStore.stop()}
      onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); trackingStore.stop(); }}
      className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white"
    >
      ■ 종료
    </button>
  </div>
)}
```

- [ ] **Step 4: 전체 테스트 통과 확인**

```bash
npm run test:run
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/pages/GroupMapPage.tsx src/pages/GroupMapPage.test.tsx
git commit -m "feat: GroupMapPage 일시정지/재개/종료 UI 추가"
```
