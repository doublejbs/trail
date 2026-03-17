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
  return `<div style="
    width:20px;height:20px;
    border-radius:50% 50% 50% 0;
    background:${color};
    transform:rotate(-45deg);
    box-shadow:0 2px 6px rgba(0,0,0,0.4);
    border:2px solid white;
  "></div>`;
}
```

- 시작 마커: `#4CAF50` (초록)
- 종료 마커: `#F44336` (빨강)
- anchor: `new window.naver.maps.Point(10, 20)` — 핀 꼭짓점이 좌표에 맞닿도록

## MapStore 변경 사항

### 새 observable 필드

```ts
public startMarker: naver.maps.Marker | null = null;  // observable.ref
public endMarker: naver.maps.Marker | null = null;    // observable.ref
```

`makeAutoObservable` 옵션에 `startMarker: observable.ref, endMarker: observable.ref` 추가.

### `drawGpxRoute()` 변경

폴리라인 생성 직후, 마커 생성 로직 추가:

```ts
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

`createPinHtml`은 `MapStore.ts` 파일 내 모듈 스코프 순수 함수로 선언한다 (클래스 외부).

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

기존 `describe('GPX 기능', ...)` 블록 내 `describe('마커', ...)` 추가:

- `drawGpxRoute()` 후 `startMarker`가 `mockStartMarker`로 설정됨
- `drawGpxRoute()` 후 `endMarker`가 `mockEndMarker`로 설정됨
- Marker가 시작/종료 좌표로 생성됨 (position 검증)
- trackpoint 1개일 때 `endMarker`가 null
- `clearGpxRoute()` 후 두 마커 모두 `setMap(null)` 호출 및 null로 설정
- `destroy()` 후 두 마커 모두 정리됨

Mock 설정: `vi.hoisted`에서 `mockStartMarker = { setMap: vi.fn() }`, `mockEndMarker = { setMap: vi.fn() }` 추가. `mockNaverMaps`에 `Marker: vi.fn()` 추가 (첫 번째 호출은 `mockStartMarker`, 두 번째는 `mockEndMarker` 반환).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/stores/MapStore.ts` | `startMarker`, `endMarker` 추가; `drawGpxRoute`, `clearGpxRoute` 업데이트; `createPinHtml` 함수 추가 |
| `src/stores/MapStore.test.ts` | 마커 관련 테스트 추가 |
