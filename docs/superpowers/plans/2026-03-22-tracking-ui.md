# Tracking UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹 지도 페이지에 시작/중지 트래킹 버튼과 실시간 거리·시간·속도 통계 패널을 추가한다.

**Architecture:** 새 `TrackingStore`가 트래킹 상태(타이머, 거리, 속도, 포인트 배열)를 전담하고, `MapStore.startWatchingLocation()`에 옵션 콜백을 추가해 위치 업데이트를 TrackingStore에 전달한다. GroupMapPage는 두 스토어를 모두 인스턴스화하고 `isTracking` 상태에 따라 시작 버튼 또는 통계 패널을 렌더링한다.

**Tech Stack:** React 19, TypeScript, MobX 6, Tailwind CSS 4, Vitest, React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-22-tracking-ui-design.md`

---

## File Map

| File | Role |
|------|------|
| `src/stores/TrackingStore.ts` | 새 파일 — 트래킹 상태·타이머·거리·속도 계산 |
| `src/stores/TrackingStore.test.ts` | 새 파일 — TrackingStore 단위 테스트 |
| `src/stores/MapStore.ts` | `startWatchingLocation(callback?)` 추가 |
| `src/stores/MapStore.test.ts` | 콜백 호출 테스트 2개 추가 |
| `src/pages/GroupMapPage.tsx` | TrackingStore 통합 + 트래킹 UI 렌더링 |
| `src/pages/GroupMapPage.test.tsx` | 트래킹 UI 테스트 추가 (기존 테스트 변경 없음) |

---

## Task 1: TrackingStore — 핵심 상태 및 타이머

**Files:**
- Create: `src/stores/TrackingStore.ts`
- Create: `src/stores/TrackingStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/stores/TrackingStore.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrackingStore } from './TrackingStore';

describe('TrackingStore', () => {
  let store: TrackingStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new TrackingStore();
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
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/TrackingStore.test.ts
```
Expected: FAIL (TrackingStore 파일 없음)

- [ ] **Step 3: TrackingStore 최소 구현**

`src/stores/TrackingStore.ts`:
```typescript
import { makeAutoObservable, runInAction } from 'mobx';

class TrackingStore {
  public isTracking: boolean = false;
  public elapsedSeconds: number = 0;
  public distanceMeters: number = 0;
  public speedKmh: number = 0;
  public points: { lat: number; lng: number; ts: number }[] = [];

  private timerId: ReturnType<typeof setInterval> | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public start(): void {
    this._clearTimer();
    runInAction(() => {
      this.isTracking = true;
      this.elapsedSeconds = 0;
      this.distanceMeters = 0;
      this.speedKmh = 0;
      this.points = [];
    });
    this.timerId = setInterval(() => {
      runInAction(() => { this.elapsedSeconds += 1; });
    }, 1000);
  }

  public stop(): void {
    this._clearTimer();
    runInAction(() => { this.isTracking = false; });
  }

  public dispose(): void {
    this._clearTimer();
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
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/TrackingStore.ts src/stores/TrackingStore.test.ts
git commit -m "feat: TrackingStore 기본 상태·타이머 구현"
```

---

## Task 2: TrackingStore — addPoint 및 computed

**Files:**
- Modify: `src/stores/TrackingStore.ts`
- Modify: `src/stores/TrackingStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`TrackingStore.test.ts`에 아래 describe 블록 추가:
```typescript
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
      // 약 100m 북쪽 (0.0009도 ≈ 100m)
      store.addPoint(37.501, 126.9);
      expect(store.distanceMeters).toBeGreaterThan(0);
    });

    it('두 번째 포인트 — speed 계산', () => {
      store.start();
      const ts1 = Date.now();
      vi.setSystemTime(ts1);
      store.addPoint(37.5, 126.9);
      // 1초 후 약 100m 이동
      vi.setSystemTime(ts1 + 1000);
      store.addPoint(37.501, 126.9);
      // 약 100m/s = 360km/h 아니고, 0.111km / (1/3600)h = 400km/h — 실제 거리 ~111m/s → 그냥 > 0 확인
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
      // distanceMeters를 직접 설정해서 computed 테스트
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
```

`TrackingStore.test.ts` 상단에 import 추가:
```typescript
import { runInAction } from 'mobx';
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/TrackingStore.test.ts
```
Expected: FAIL (addPoint, formattedTime 등 미구현)

- [ ] **Step 3: TrackingStore에 addPoint + computed 추가**

`src/stores/TrackingStore.ts` 전체:
```typescript
import { makeAutoObservable, computed, runInAction } from 'mobx';

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

  private timerId: ReturnType<typeof setInterval> | null = null;

  public constructor() {
    makeAutoObservable(this, { formattedTime: computed, formattedDistance: computed, formattedSpeed: computed });
  }

  public start(): void {
    this._clearTimer();
    runInAction(() => {
      this.isTracking = true;
      this.elapsedSeconds = 0;
      this.distanceMeters = 0;
      this.speedKmh = 0;
      this.points = [];
    });
    this.timerId = setInterval(() => {
      runInAction(() => { this.elapsedSeconds += 1; });
    }, 1000);
  }

  public stop(): void {
    this._clearTimer();
    runInAction(() => { this.isTracking = false; });
  }

  public addPoint(lat: number, lng: number): void {
    if (!this.isTracking) return;
    const point = { lat, lng, ts: Date.now() };
    runInAction(() => {
      if (this.points.length > 0) {
        const prev = this.points[this.points.length - 1];
        const meters = haversineMeters(prev.lat, prev.lng, lat, lng);
        this.distanceMeters += meters;
        const dtHours = (point.ts - prev.ts) / 3_600_000;
        this.speedKmh = dtHours > 0 ? (meters / 1000) / dtHours : 0;
      }
      this.points.push(point);
    });
  }

  public dispose(): void {
    this._clearTimer();
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
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/TrackingStore.ts src/stores/TrackingStore.test.ts
git commit -m "feat: TrackingStore addPoint·거리·속도·computed 구현"
```

---

## Task 3: MapStore — onLocationUpdate 콜백 추가

**Files:**
- Modify: `src/stores/MapStore.ts:216-244`
- Modify: `src/stores/MapStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`MapStore.test.ts`의 `describe('startWatchingLocation()')` 블록 마지막에 추가:

```typescript
    it('onLocationUpdate 콜백이 올바른 좌표로 호출됨', () => {
      const callback = vi.fn();
      watchSpy.mockImplementation((cb: (pos: GeolocationPosition) => void) => {
        cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
        return 42;
      });
      store.startWatchingLocation(callback);
      expect(callback).toHaveBeenCalledWith(37.1, 127.1);
    });

    it('콜백 없이 호출해도 기존 동작 유지', () => {
      watchSpy.mockImplementation((cb: (pos: GeolocationPosition) => void) => {
        cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
        return 42;
      });
      expect(() => store.startWatchingLocation()).not.toThrow();
      expect(store.locationMarker).not.toBeNull();
    });
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```
Expected: FAIL (콜백 파라미터 없음)

- [ ] **Step 3: MapStore.startWatchingLocation 수정**

`src/stores/MapStore.ts`의 `startWatchingLocation` 메서드를 아래로 교체:

```typescript
  public startWatchingLocation(onLocationUpdate?: (lat: number, lng: number) => void): void {
    if (!this.map) return;
    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lastPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        if (!this.map) return;
        const { latitude, longitude } = pos.coords;
        const latLng = new window.naver.maps.LatLng(latitude, longitude);

        runInAction(() => {
          if (!this.locationMarker) {
            this.locationMarker = new window.naver.maps.Marker({
              map: this.map!,
              position: latLng,
              icon: {
                content: '<div style="width:14px;height:14px;border-radius:50%;background:#4A90D9;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
                anchor: new window.naver.maps.Point(7, 7),
              },
            });
          } else {
            this.locationMarker.setPosition(latLng);
          }
        });

        onLocationUpdate?.(latitude, longitude);
      },
      () => { /* 에러 무시 */ },
    );
  }
```

- [ ] **Step 4: 전체 MapStore 테스트 통과 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/MapStore.ts src/stores/MapStore.test.ts
git commit -m "feat: MapStore.startWatchingLocation에 onLocationUpdate 콜백 추가"
```

---

## Task 4: GroupMapPage — TrackingStore 통합 및 UI

**Files:**
- Modify: `src/pages/GroupMapPage.tsx`
- Modify: `src/pages/GroupMapPage.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`GroupMapPage.test.tsx`의 mock 섹션에 TrackingStore mock 추가 (기존 mock 바로 뒤):

```typescript
const { mockTrackingStore } = vi.hoisted(() => ({
  mockTrackingStore: {
    isTracking: false,
    elapsedSeconds: 0,
    distanceMeters: 0,
    speedKmh: 0,
    formattedTime: '00:00:00',
    formattedDistance: '0m',
    formattedSpeed: '0.0km/h',
    start: vi.fn(),
    stop: vi.fn(),
    addPoint: vi.fn(),
    dispose: vi.fn(),
  },
}));

vi.mock('../stores/TrackingStore', () => ({
  TrackingStore: vi.fn(function () { return mockTrackingStore; }),
}));
```

`beforeEach`에 추가:
```typescript
    mockTrackingStore.isTracking = false;
    mockTrackingStore.formattedTime = '00:00:00';
    mockTrackingStore.formattedDistance = '0m';
    mockTrackingStore.formattedSpeed = '0.0km/h';
```

테스트 블록 추가:
```typescript
  describe('트래킹 UI', () => {
    it('트래킹 전 — 시작 버튼 표시', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /시작/ })).toBeInTheDocument();
      });
    });

    it('시작 버튼 클릭 시 trackingStore.start() 호출', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /시작/ }));
      fireEvent.click(screen.getByRole('button', { name: /시작/ }));
      expect(mockTrackingStore.start).toHaveBeenCalledOnce();
    });

    it('트래킹 중 — 통계 패널 표시', async () => {
      mockTrackingStore.isTracking = true;
      mockTrackingStore.formattedTime = '00:01:23';
      mockTrackingStore.formattedDistance = '250m';
      mockTrackingStore.formattedSpeed = '3.5km/h';
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByText('00:01:23')).toBeInTheDocument();
        expect(screen.getByText('250m')).toBeInTheDocument();
        expect(screen.getByText('3.5km/h')).toBeInTheDocument();
      });
    });

    it('트래킹 중 — 중지 버튼 표시', async () => {
      mockTrackingStore.isTracking = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /중지/ })).toBeInTheDocument();
      });
    });

    it('중지 버튼 클릭 시 trackingStore.stop() 호출', async () => {
      mockTrackingStore.isTracking = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /중지/ }));
      fireEvent.click(screen.getByRole('button', { name: /중지/ }));
      expect(mockTrackingStore.stop).toHaveBeenCalledOnce();
    });

    it('트래킹 중 — 시작 버튼 미표시', async () => {
      mockTrackingStore.isTracking = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /중지/ }));
      expect(screen.queryByRole('button', { name: /시작/ })).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```
Expected: FAIL (시작/중지 버튼 미존재)

- [ ] **Step 3: GroupMapPage 구현**

`src/pages/GroupMapPage.tsx` 전체 교체:

```typescript
import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { Button } from '@/components/ui/button';
import { Crosshair } from 'lucide-react';
import { MapStore } from '../stores/MapStore';
import { GroupMapStore } from '../stores/GroupMapStore';
import { TrackingStore } from '../stores/TrackingStore';

export const GroupMapPage = observer(() => {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapStore] = useState(() => new MapStore());
  const [store] = useState(() => new GroupMapStore(navigate));
  const [trackingStore] = useState(() => new TrackingStore());

  // Effect 1: 데이터 fetch
  useEffect(() => {
    if (!id) return;
    return store.load(id);
  }, [store, id]);

  // Effect 2: 지도 초기화 + GPX 렌더링 (DOM ref + 데이터가 준비된 후)
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

  // Effect 3: TrackingStore 정리
  useEffect(() => {
    return () => { trackingStore.dispose(); };
  }, [trackingStore]);

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

  const bottomOffset = trackingStore.isTracking ? 'bottom-36' : 'bottom-20';

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

      {/* 트래킹 시작 버튼 */}
      {!trackingStore.isTracking && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
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
      {trackingStore.isTracking && (
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
            className="w-full bg-red-500 text-white py-2 rounded-xl text-sm font-semibold"
          >
            ■ 중지
          </button>
        </div>
      )}

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

- [ ] **Step 4: 전체 테스트 통과 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```
Expected: PASS

- [ ] **Step 5: 전체 테스트 suite 확인**

```bash
npx vitest run
```
Expected: 모든 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/pages/GroupMapPage.tsx src/pages/GroupMapPage.test.tsx
git commit -m "feat: 트래킹 시작/중지 버튼 및 통계 패널 추가"
```
