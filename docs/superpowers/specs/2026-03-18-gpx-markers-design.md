# GPX 시작/종료 마커 설계

**날짜:** 2026-03-18

## 개요

GPX 경로의 첫 번째 trackpoint(시작)와 마지막 trackpoint(종료)에 핀 드롭 스타일 마커를 표시한다. 마커는 폴리라인과 동일한 lifecycle로 관리된다.

## 범위

- `MapStore`에 `startMarker`, `endMarker` 추가
- `drawGpxRoute()` 내에서 마커 생성
- `clearGpxRoute()` 내에서 마커 제거
- `src/stores/MapStore.test.ts` 테스트 추가

**범위 외:** 마커 클릭 이벤트, 정보창(InfoWindow), 마커 개수 표시.

## 마커 스타일

Naver Maps `naver.maps.Marker`의 `icon.content`에 HTML 문자열을 넣어 핀 드롭 모양을 구현한다.

```ts
function createPinHtml(color: string): string {
  return `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid white;"></div>`;
}
```

`createPinHtml`은 `MapStore.ts` 파일 내 모듈 스코프 순수 함수로 선언한다 (클래스 외부).

- 시작 마커: `#4CAF50` (초록)
- 종료 마커: `#F44336` (빨강)
- anchor: `new window.naver.maps.Point(10, 20)` — 핀 꼭짓점이 좌표에 맞닿도록

## MapStore 변경 사항

### 새 observable 필드

```ts
public startMarker: naver.maps.Marker | null = null;  // observable.ref
public endMarker: naver.maps.Marker | null = null;    // observable.ref
```

`makeAutoObservable` 옵션 — 기존 필드에 두 필드 추가, 최종 호출:

```ts
makeAutoObservable(this, {
  map: observable.ref,
  gpxPolyline: observable.ref,
  startMarker: observable.ref,
  endMarker: observable.ref,
});
```

### `drawGpxRoute()` 변경

메서드 시작 시 기존 마커를 먼저 정리한 뒤 생성한다. 폴리라인 생성 직후:

```ts
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

// 시작 = 종료인 경우(trackpoint 1개) 종료 마커 생략
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
```

### `clearGpxRoute()` 변경

```ts
public clearGpxRoute(): void {
  this.gpxPolyline?.setMap(null);
  this.gpxPolyline = null;
  this.startMarker?.setMap(null);
  this.startMarker = null;
  this.endMarker?.setMap(null);
  this.endMarker = null;
}
```

`destroy()`는 이미 `clearGpxRoute()`를 호출하므로 변경 없음.

## 테스트

### Mock 설정

기존 `MapStore.test.ts`는 파일 최상단에 `const`로 mock을 선언한다 (`vi.hoisted` 미사용). 동일한 패턴 따름:

```ts
const mockStartMarker = { setMap: vi.fn() };
const mockEndMarker = { setMap: vi.fn() };
```

`mockNaverMaps`에 `Marker` 추가:

```ts
const mockNaverMaps = {
  Map: vi.fn(function () { return mockMap; }),
  LatLng: vi.fn(function (lat: number, lng: number) { return { lat, lng }; }),
  Polyline: vi.fn(function () { return mockPolyline; }),
  Marker: vi.fn(),  // beforeEach에서 counter 기반 mockImplementation으로 설정
  Point: vi.fn(function (x: number, y: number) { return { x, y }; }),
};
```

GPX 픽스처:

```ts
const GPX_ONE_POINT = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><trkseg><trkpt lat="37.5" lon="126.9"></trkpt></trkseg></trk></gpx>`;
```

`describe('GPX 기능', ...)` 내 `beforeEach`에서 call counter 기반 팩토리 mock 사용:

```ts
let markerCallCount = 0;
mockNaverMaps.Marker.mockImplementation(() => {
  const count = markerCallCount++;
  return count === 0 ? mockStartMarker : mockEndMarker;
});
```

`beforeEach` 시작 시 `markerCallCount = 0;`으로 리셋.

position 검증은 `mockNaverMaps.Marker.mock.calls[0][0].position`와 `mock.calls[1][0].position`으로 직접 확인.

### 테스트 케이스 (`describe('마커', ...)`를 `describe('GPX 기능', ...)` 내부에 추가)

- `drawGpxRoute()` 후 `startMarker`가 `mockStartMarker`로 설정됨
- `drawGpxRoute()` 후 `endMarker`가 `mockEndMarker`로 설정됨
- 시작 마커가 `path[0]` 좌표로 생성됨 (`Marker.mock.calls[0][0].position`)
- 종료 마커가 `path[path.length-1]` 좌표로 생성됨 (`Marker.mock.calls[1][0].position`)
- trackpoint 1개(`GPX_ONE_POINT`)일 때 `endMarker`가 null, `Marker`가 1번만 호출됨
- `clearGpxRoute()` 후 `startMarker.setMap(null)` 호출 및 `startMarker === null`
- `clearGpxRoute()` 후 `endMarker.setMap(null)` 호출 및 `endMarker === null`
- `destroy()` 후 두 마커 모두 정리됨

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/stores/MapStore.ts` | `startMarker`, `endMarker` 추가; `drawGpxRoute`, `clearGpxRoute` 업데이트; `createPinHtml` 함수 추가 |
| `src/stores/MapStore.test.ts` | `mockStartMarker`, `mockEndMarker`, `Marker` mock, `Point` mock, `GPX_ONE_POINT` 픽스처 추가; 마커 테스트 케이스 추가 |
