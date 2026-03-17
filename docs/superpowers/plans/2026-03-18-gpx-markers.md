# GPX 시작/종료 마커 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GPX 경로의 시작/종료 지점에 핀 드롭 스타일 마커(초록/빨강)를 지도에 표시한다.

**Architecture:** `MapStore.drawGpxRoute()`에 마커 생성 로직을 추가하고, `clearGpxRoute()`에서 정리한다. `startMarker`, `endMarker`를 `observable.ref`로 선언해 폴리라인과 동일한 lifecycle로 관리한다. 마커 HTML은 모듈 스코프 순수 함수 `createPinHtml(color)`로 생성한다.

**Tech Stack:** TypeScript, MobX (`makeAutoObservable`, `observable.ref`), Naver Maps JS SDK v3 (`naver.maps.Marker`, `naver.maps.Point`), Vitest

---

## Chunk 1: MapStore 마커 추가 (TDD)

### Task 1: MapStore에 startMarker / endMarker 추가 (TDD)

**Files:**
- Modify: `src/stores/MapStore.ts`
- Modify: `src/stores/MapStore.test.ts`

---

- [ ] **Step 1: 실패하는 테스트 추가**

`src/stores/MapStore.test.ts`를 열어 아래 변경을 적용한다.

**① 파일 최상단 mock 상수 블록에 추가** (`const mockPolyline` 바로 뒤):

```ts
const mockStartMarker = { setMap: vi.fn() };
const mockEndMarker = { setMap: vi.fn() };
```

**② `mockNaverMaps` 객체에 `Marker`와 `Point` 추가**:

기존:
```ts
const mockNaverMaps = {
  Map: vi.fn(function () { return mockMap; }),
  LatLng: vi.fn(function (lat: number, lng: number) { return { lat, lng }; }),
  Polyline: vi.fn(function () { return mockPolyline; }),
};
```

교체:
```ts
const mockNaverMaps = {
  Map: vi.fn(function () { return mockMap; }),
  LatLng: vi.fn(function (lat: number, lng: number) { return { lat, lng }; }),
  Polyline: vi.fn(function () { return mockPolyline; }),
  Marker: vi.fn(),
  Point: vi.fn(function (x: number, y: number) { return { x, y }; }),
};
```

**③ GPX_ONE_POINT 픽스처 추가** (기존 `GPX_NO_POINTS` 상수 바로 뒤):

```ts
const GPX_ONE_POINT = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><trkseg><trkpt lat="37.5" lon="126.9"></trkpt></trkseg></trk></gpx>`;
```

**④ `describe('GPX 기능', ...)` 내 `beforeEach`에 Marker mock 설정 추가**:

기존 `beforeEach` 안에 아래 두 줄 추가 (`mockNaverMaps.Polyline.mockImplementation(...)` 바로 뒤):

```ts
let markerCallCount = 0;
mockNaverMaps.Marker.mockImplementation(() => {
  const count = markerCallCount++;
  return count === 0 ? mockStartMarker : mockEndMarker;
});
```

그리고 `beforeEach` 시작 부분(`vi.clearAllMocks()` 위치 이전에 선언된 `markerCallCount` 변수를 리셋하도록) `markerCallCount = 0;`을 `vi.clearAllMocks()` 바로 뒤에 추가:

> **주의:** `let markerCallCount = 0;`은 `beforeEach` 콜백 밖의 `describe('GPX 기능', ...)` 스코프에 선언하고, `beforeEach` 안에서 `markerCallCount = 0;`으로 리셋한다.

최종 `describe('GPX 기능', ...)` 구조:

```ts
describe('GPX 기능', () => {
  let markerCallCount = 0;

  beforeEach(() => {
    markerCallCount = 0;
    mockNaverMaps.Polyline.mockImplementation(function () { return mockPolyline; });
    mockNaverMaps.Marker.mockImplementation(() => {
      const count = markerCallCount++;
      return count === 0 ? mockStartMarker : mockEndMarker;
    });
    store = new MapStore();
    (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
    store.initMap(document.createElement('div'));
  });

  // ... 기존 테스트들 ...
```

**⑤ `describe('GPX 기능', ...)` 내부에 `describe('마커', ...)` 블록 추가** (기존 `describe('destroy() GPX 정리', ...)` 뒤):

```ts
describe('마커', () => {
  it('drawGpxRoute() 후 startMarker가 설정됨', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    expect(store.startMarker).toBe(mockStartMarker);
  });

  it('drawGpxRoute() 후 endMarker가 설정됨', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    expect(store.endMarker).toBe(mockEndMarker);
  });

  it('시작 마커가 첫 번째 trackpoint 좌표로 생성됨', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    expect(mockNaverMaps.Marker.mock.calls[0][0].position).toEqual({ lat: 37.5, lng: 126.9 });
  });

  it('종료 마커가 마지막 trackpoint 좌표로 생성됨', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    expect(mockNaverMaps.Marker.mock.calls[1][0].position).toEqual({ lat: 37.6, lng: 127.0 });
  });

  it('trackpoint 1개일 때 endMarker가 null이고 Marker가 1번만 호출됨', () => {
    store.drawGpxRoute(GPX_ONE_POINT);
    expect(store.endMarker).toBeNull();
    expect(mockNaverMaps.Marker).toHaveBeenCalledTimes(1);
  });

  it('clearGpxRoute() 후 startMarker.setMap(null) 호출 및 null', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    store.clearGpxRoute();
    expect(mockStartMarker.setMap).toHaveBeenCalledWith(null);
    expect(store.startMarker).toBeNull();
  });

  it('clearGpxRoute() 후 endMarker.setMap(null) 호출 및 null', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    store.clearGpxRoute();
    expect(mockEndMarker.setMap).toHaveBeenCalledWith(null);
    expect(store.endMarker).toBeNull();
  });

  it('destroy() 후 두 마커 모두 정리됨', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    store.destroy();
    expect(mockStartMarker.setMap).toHaveBeenCalledWith(null);
    expect(mockEndMarker.setMap).toHaveBeenCalledWith(null);
    expect(store.startMarker).toBeNull();
    expect(store.endMarker).toBeNull();
  });
});
```

---

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```

Expected: 마커 테스트 8개 FAIL (`store.startMarker is not a property` 등), 기존 테스트는 PASS.

---

- [ ] **Step 3: MapStore 구현**

`src/stores/MapStore.ts`를 아래 전체 내용으로 교체:

```ts
import { makeAutoObservable, observable, runInAction } from "mobx";

function createPinHtml(color: string): string {
  return `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid white;"></div>`;
}

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;
  public gpxPolyline: naver.maps.Polyline | null = null;
  public startMarker: naver.maps.Marker | null = null;
  public endMarker: naver.maps.Marker | null = null;

  public constructor() {
    makeAutoObservable(this, {
      map: observable.ref,
      gpxPolyline: observable.ref,
      startMarker: observable.ref,
      endMarker: observable.ref,
    });
  }

  public initMap(el: HTMLDivElement): void {
    if (this.map) return;

    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
    if (!clientId) {
      console.warn("VITE_NAVER_MAP_CLIENT_ID is not set");
      this.error = true;
      return;
    }

    if (!window.naver?.maps?.Map) {
      console.error(
        "Naver Maps SDK not loaded — check script tag and API key authorization for this domain",
      );
      this.error = true;
      return;
    }

    (window as Window & { navermap_authFailure?: () => void }).navermap_authFailure = () => {
      console.error("Naver Maps auth failed — check API key and authorized domains in NCP console");
      runInAction(() => { this.error = true; });
    };

    try {
      const instance = new window.naver.maps.Map(el, {
        center: new window.naver.maps.LatLng(37.5665, 126.978),
        zoom: 14,
      });
      this.map = instance;
    } catch (e) {
      console.error("Naver Maps init failed:", e);
      this.error = true;
    }
  }

  public drawGpxRoute(gpxText: string): void {
    if (!this.map) {
      this.error = true;
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxText, 'application/xml');

    if (doc.querySelector('parsererror')) {
      this.error = true;
      return;
    }

    const trkpts = Array.from(doc.getElementsByTagName('trkpt'));

    if (trkpts.length === 0) {
      this.error = true;
      return;
    }

    const path = trkpts
      .filter((pt) => {
        const lat = parseFloat(pt.getAttribute('lat') ?? '');
        const lon = parseFloat(pt.getAttribute('lon') ?? '');
        return !isNaN(lat) && !isNaN(lon);
      })
      .map((pt) =>
        new window.naver.maps.LatLng(
          parseFloat(pt.getAttribute('lat')!),
          parseFloat(pt.getAttribute('lon')!),
        ),
      );

    if (path.length === 0) {
      this.error = true;
      return;
    }

    const polyline = new window.naver.maps.Polyline({
      map: this.map,
      path,
      strokeColor: '#FF5722',
      strokeWeight: 4,
      strokeOpacity: 0.8,
    });

    this.map.setCenter(path[0]);
    this.gpxPolyline = polyline;

    // 이전 마커 정리 (재호출 시 leak 방지)
    this.startMarker?.setMap(null);
    this.startMarker = null;
    this.endMarker?.setMap(null);
    this.endMarker = null;

    this.startMarker = new window.naver.maps.Marker({
      map: this.map,
      position: path[0],
      icon: {
        content: createPinHtml('#4CAF50'),
        anchor: new window.naver.maps.Point(10, 20),
      },
    });

    if (path.length > 1) {
      this.endMarker = new window.naver.maps.Marker({
        map: this.map,
        position: path[path.length - 1],
        icon: {
          content: createPinHtml('#F44336'),
          anchor: new window.naver.maps.Point(10, 20),
        },
      });
    }
  }

  public clearGpxRoute(): void {
    this.gpxPolyline?.setMap(null);
    this.gpxPolyline = null;
    this.startMarker?.setMap(null);
    this.startMarker = null;
    this.endMarker?.setMap(null);
    this.endMarker = null;
  }

  public destroy(): void {
    this.clearGpxRoute();
    this.map?.destroy();
    this.map = null;
  }

  public locate(): void {
    if (!this.map || !navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      this.map!.setCenter(new window.naver.maps.LatLng(latitude, longitude));
    });
  }
}

export { MapStore };
```

---

- [ ] **Step 4: 전체 MapStore 테스트 통과 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```

Expected: 전체 PASS (기존 20개 + 마커 8개 = 28개)

---

- [ ] **Step 5: 커밋**

```bash
git add src/stores/MapStore.ts src/stores/MapStore.test.ts
git commit -m "feat: add start/end pin markers to GPX route in MapStore"
```
