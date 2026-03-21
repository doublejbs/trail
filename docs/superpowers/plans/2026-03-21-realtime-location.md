# 실시간 위치 표시 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GroupMapPage에서 사용자의 현재 위치를 파란 원 마커로 실시간 표시한다.

**Architecture:** MapStore에 `watchPosition` 기반 위치 추적 메서드를 추가한다. GroupMapPage의 Effect 2에서 `initMap()` 직후 `startWatchingLocation()`을 호출하며, `destroy()` 시 자동 정리된다.

**Tech Stack:** MobX 6 (makeAutoObservable, observable.ref), Geolocation API (watchPosition/clearWatch), Naver Maps SDK (Marker, LatLng, Point), Vitest

---

## 파일 구조

- Modify: `src/stores/MapStore.ts` — 위치 추적 필드 + 메서드 추가, `destroy()` 수정
- Modify: `src/stores/MapStore.test.ts` — 새 메서드 단위 테스트 추가
- Modify: `src/pages/GroupMapPage.tsx` — Effect 2에 `startWatchingLocation()` 호출 추가
- Modify: `src/pages/GroupMapPage.test.tsx` — `mockMapStore`에 `startWatchingLocation` mock 추가

---

### Task 1: MapStore — `startWatchingLocation()` 테스트

**Files:**
- Modify: `src/stores/MapStore.test.ts`

- [ ] **Step 1: `watchPosition` 호출 확인 테스트 작성**

`MapStore.test.ts`의 `describe('MapStore')` 블록 안, 기존 `describe('GPX 기능')` 바로 아래에 새 `describe` 블록을 추가한다:

```ts
describe('startWatchingLocation()', () => {
  let watchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    watchSpy = vi.spyOn(navigator.geolocation, 'watchPosition').mockImplementation(() => 42);
    (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
    store = new MapStore();
    store.initMap(document.createElement('div'));
  });

  it('map이 있으면 watchPosition 호출', () => {
    store.startWatchingLocation();
    expect(watchSpy).toHaveBeenCalledOnce();
  });

  it('map이 null이면 watchPosition 미호출', () => {
    store = new MapStore(); // map이 null인 새 store
    store.startWatchingLocation();
    expect(watchSpy).not.toHaveBeenCalled();
  });

  it('첫 번째 위치 콜백에서 setCenter 호출', () => {
    watchSpy.mockImplementation((cb) => {
      cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
      return 42;
    });
    store.startWatchingLocation();
    expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 37.1, lng: 127.1 });
  });

  it('두 번째 위치 콜백에서 setCenter 미호출', () => {
    let callCount = 0;
    watchSpy.mockImplementation((cb) => {
      cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
      callCount++;
      if (callCount === 1) {
        cb({ coords: { latitude: 37.2, longitude: 127.2 } } as GeolocationPosition);
      }
      return 42;
    });
    store.startWatchingLocation();
    expect(mockMap.setCenter).toHaveBeenCalledTimes(1);
  });

  it('위치 콜백에서 Marker 생성', () => {
    mockNaverMaps.Marker.mockImplementation(function () { return { setMap: vi.fn(), setPosition: vi.fn() }; });
    watchSpy.mockImplementation((cb) => {
      cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
      return 42;
    });
    store.startWatchingLocation();
    expect(store.locationMarker).not.toBeNull();
  });

  it('두 번째 위치 콜백에서 새 마커 생성 없이 setPosition 호출', () => {
    const mockLocationMarker = { setMap: vi.fn(), setPosition: vi.fn() };
    mockNaverMaps.Marker.mockImplementation(function () { return mockLocationMarker; });
    let firstCb: ((pos: GeolocationPosition) => void) | null = null;
    watchSpy.mockImplementation((cb) => {
      firstCb = cb as (pos: GeolocationPosition) => void;
      cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
      return 42;
    });
    store.startWatchingLocation();
    const markerCallCount = (mockNaverMaps.Marker as ReturnType<typeof vi.fn>).mock.calls.length;
    firstCb!({ coords: { latitude: 37.2, longitude: 127.2 } } as GeolocationPosition);
    expect((mockNaverMaps.Marker as ReturnType<typeof vi.fn>).mock.calls.length).toBe(markerCallCount);
    expect(mockLocationMarker.setPosition).toHaveBeenCalledWith({ lat: 37.2, lng: 127.2 });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```
Expected: `startWatchingLocation is not a function` 오류로 실패

---

### Task 2: MapStore — `startWatchingLocation()` 구현

**Files:**
- Modify: `src/stores/MapStore.ts`

- [ ] **Step 1: 새 필드 및 observable 추가**

`MapStore` 클래스 필드 선언 부분에 다음을 추가:

```ts
// 기존 public 필드들 아래에 추가
public locationMarker: naver.maps.Marker | null = null;

// private 필드들 추가
private watchId: number | null = null;
private hasInitialCenter: boolean = false;
```

`makeAutoObservable` 호출에 `locationMarker: observable.ref` 추가:

```ts
makeAutoObservable(this, {
  map: observable.ref,
  gpxPolyline: observable.ref,
  startMarker: observable.ref,
  endMarker: observable.ref,
  locationMarker: observable.ref,  // 추가
});
```

- [ ] **Step 2: `startWatchingLocation()` 메서드 구현**

`locate()` 메서드 바로 아래에 추가:

```ts
public startWatchingLocation(): void {
  if (!this.map) return;
  if (!navigator.geolocation) return;

  this.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (!this.map) return;
      const { latitude, longitude } = pos.coords;
      const latLng = new window.naver.maps.LatLng(latitude, longitude);

      if (!this.hasInitialCenter) {
        this.map.setCenter(latLng);
        this.hasInitialCenter = true;
      }

      if (!this.locationMarker) {
        this.locationMarker = new window.naver.maps.Marker({
          map: this.map,
          position: latLng,
          icon: {
            content: '<div style="width:14px;height:14px;border-radius:50%;background:#4A90D9;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
            anchor: new window.naver.maps.Point(7, 7),
          },
        });
      } else {
        this.locationMarker.setPosition(latLng);
      }
    },
    () => { /* 에러 무시 */ },
  );
}
```

- [ ] **Step 3: Task 1 테스트 재실행 — 통과 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```
Expected: `startWatchingLocation()` describe 블록의 모든 테스트 PASS

---

### Task 3: MapStore — `stopWatchingLocation()` 테스트 + 구현

**Files:**
- Modify: `src/stores/MapStore.ts`
- Modify: `src/stores/MapStore.test.ts`

- [ ] **Step 1: `stopWatchingLocation()` 테스트 작성**

Task 1의 `describe('startWatchingLocation()')` 블록 바로 아래에 추가:

```ts
describe('stopWatchingLocation()', () => {
  let watchSpy: ReturnType<typeof vi.spyOn>;
  let clearSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    watchSpy = vi.spyOn(navigator.geolocation, 'watchPosition').mockReturnValue(42);
    clearSpy = vi.spyOn(navigator.geolocation, 'clearWatch').mockImplementation(() => {});
    const mockLocationMarker = { setMap: vi.fn(), setPosition: vi.fn() };
    mockNaverMaps.Marker.mockImplementation(function () { return mockLocationMarker; });
    (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
    store = new MapStore();
    store.initMap(document.createElement('div'));
  });

  it('clearWatch 호출 + 마커 제거', () => {
    // 위치 콜백으로 마커 먼저 생성
    watchSpy.mockImplementation((cb) => {
      cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
      return 42;
    });
    store.startWatchingLocation();
    store.stopWatchingLocation();
    expect(clearSpy).toHaveBeenCalledWith(42);
    expect(store.locationMarker).toBeNull();
  });

  it('watchId가 null이면 clearWatch 미호출', () => {
    store.stopWatchingLocation();
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```
Expected: `stopWatchingLocation is not a function` 오류로 실패

- [ ] **Step 3: `stopWatchingLocation()` 구현**

`startWatchingLocation()` 바로 아래에 추가:

```ts
public stopWatchingLocation(): void {
  if (this.watchId !== null) {
    navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
  this.locationMarker?.setMap(null);
  this.locationMarker = null;
  this.hasInitialCenter = false;
}
```

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```
Expected: `stopWatchingLocation()` describe 블록 PASS

---

### Task 4: MapStore — `destroy()` 수정

**Files:**
- Modify: `src/stores/MapStore.ts`
- Modify: `src/stores/MapStore.test.ts`

- [ ] **Step 1: `destroy()` 테스트 추가**

기존 `describe('destroy() GPX 정리')` 블록을 찾아 테스트를 추가:

```ts
it('destroy() 호출 시 clearWatch 호출', () => {
  const clearSpy = vi.spyOn(navigator.geolocation, 'clearWatch').mockImplementation(() => {});
  vi.spyOn(navigator.geolocation, 'watchPosition').mockReturnValue(42);
  store.startWatchingLocation();
  store.destroy();
  expect(clearSpy).toHaveBeenCalledWith(42);
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```
Expected: 새 `destroy()` 테스트 FAIL (`clearWatch`가 호출되지 않음)

- [ ] **Step 3: `destroy()` 수정**

기존 `destroy()` 메서드에서 `clearGpxRoute()` 호출 앞에 `stopWatchingLocation()` 추가:

```ts
public destroy(): void {
  this.stopWatchingLocation();  // 추가
  this.clearGpxRoute();
  this.map?.destroy();
  this.map = null;
}
```

- [ ] **Step 4: 전체 MapStore 테스트 통과 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/stores/MapStore.ts src/stores/MapStore.test.ts
git commit -m "feat: MapStore — 실시간 위치 추적 (startWatchingLocation / stopWatchingLocation)"
```

---

### Task 5: GroupMapPage — `startWatchingLocation()` 연결

**Files:**
- Modify: `src/pages/GroupMapPage.tsx`
- Modify: `src/pages/GroupMapPage.test.tsx`

- [ ] **Step 1: GroupMapPage 테스트에 mock 추가 및 호출 확인 테스트 작성**

`GroupMapPage.test.tsx`의 `mockMapStore` 객체에 `startWatchingLocation` 추가:

```ts
const { mockMapStore, mockNavigate } = vi.hoisted(() => ({
  mockMapStore: {
    map: null as naver.maps.Map | null,
    error: false,
    gpxPolyline: null,
    initMap: vi.fn(),
    destroy: vi.fn(),
    locate: vi.fn(),
    drawGpxRoute: vi.fn(),
    clearGpxRoute: vi.fn(),
    startWatchingLocation: vi.fn(),  // 추가
  },
  mockNavigate: vi.fn(),
}));
```

기존 `describe('GroupMapPage')` 블록 안에 새 테스트 추가:

```ts
it('지도 로드 후 startWatchingLocation 호출', async () => {
  renderAt('/group/group-uuid-1');
  await waitFor(() => {
    expect(mockMapStore.startWatchingLocation).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```
Expected: 새 테스트 FAIL (`startWatchingLocation` 미호출)

- [ ] **Step 3: GroupMapPage Effect 2에 `startWatchingLocation()` 추가**

`GroupMapPage.tsx`의 Effect 2에서 `mapStore.initMap(mapRef.current)` 바로 다음 줄에 추가:

```ts
mapStore.initMap(mapRef.current);
mapStore.startWatchingLocation(); // initMap 실패 시(map === null) 자동 no-op
```

- [ ] **Step 4: 전체 GroupMapPage 테스트 통과 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```
Expected: 모든 테스트 PASS

- [ ] **Step 5: 전체 테스트 실행**

```bash
npm run test:run
```
Expected: 모든 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/pages/GroupMapPage.tsx src/pages/GroupMapPage.test.tsx
git commit -m "feat: GroupMapPage — 지도 초기화 후 실시간 위치 추적 시작"
```
