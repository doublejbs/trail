# 실시간 위치 표시 설계

## 개요

그룹 상세(지도) 페이지에서 사용자의 현재 위치를 파란 원 마커로 표시하고, 이동 시 마커가 실시간으로 따라온다.

## 범위

- `src/stores/MapStore.ts` — 위치 추적 로직 추가
- `src/pages/GroupMapPage.tsx` — 지도 초기화 후 추적 시작
- `src/stores/MapStore.test.ts` — 새 메서드 테스트
- `src/pages/GroupMapPage.test.tsx` — mockMapStore에 mock 메서드 추가

## MapStore 변경

### 새 private 필드

```ts
private watchId: number | null = null;
private hasInitialCenter: boolean = false;
```

### 새 observable

```ts
public locationMarker: naver.maps.Marker | null = null;
```

`makeAutoObservable` 호출 시 `observable.ref` 로 등록해야 한다. 기존 패턴과 동일:

```ts
makeAutoObservable(this, {
  map: observable.ref,
  gpxPolyline: observable.ref,
  startMarker: observable.ref,
  endMarker: observable.ref,
  locationMarker: observable.ref,   // 추가
});
```

### `startWatchingLocation(): void`

- `this.map` 이 null이면 즉시 리턴 (no-op). `locate()` 와 동일한 가드.
- `navigator.geolocation` 미지원이면 즉시 리턴.
- `watchPosition` 시작, `watchId` 저장.
- **위치 콜백** (성공):
  - `this.map` null-check (비동기 콜백이므로 재확인).
  - `hasInitialCenter === false` 면 `this.map.setCenter(latLng)` 후 `hasInitialCenter = true`. 이후 호출에서는 지도 이동 없음 (GPX 루트 중심과 충돌 방지).
  - `locationMarker` 가 없으면 생성, 있으면 `setPosition(latLng)`.
- **에러 콜백**: 조용히 무시.

### `stopWatchingLocation(): void`

```
if (this.watchId !== null) {
  navigator.geolocation.clearWatch(this.watchId);
  this.watchId = null;
}
this.locationMarker?.setMap(null);
this.locationMarker = null;
this.hasInitialCenter = false;
```

### `destroy()` 변경

기존 `clearGpxRoute()` 앞에 `stopWatchingLocation()` 추가:

```ts
public destroy(): void {
  this.stopWatchingLocation();  // 추가
  this.clearGpxRoute();
  this.map?.destroy();
  this.map = null;
}
```

### 마커 스타일

```ts
content: '<div style="width:14px;height:14px;border-radius:50%;background:#4A90D9;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
anchor: new window.naver.maps.Point(7, 7),
```

## GroupMapPage 변경

Effect 2에서 `mapStore.initMap()` 직후 `mapStore.startWatchingLocation()` 추가.

```ts
mapStore.initMap(mapRef.current);
mapStore.startWatchingLocation(); // initMap 실패 시(map === null) 자동 no-op
if (store.gpxText !== null) {
  mapStore.drawGpxRoute(store.gpxText);
} else {
  runInAction(() => { mapStore.error = true; });
}
```

별도 가드 불필요 — `startWatchingLocation()` 내부에서 `this.map` null 체크.

기존 "내 위치" 버튼(`mapStore.locate()`)은 현재 위치로 지도를 재중심하는 용도로 그대로 유지.

## 에러 처리

- geolocation 미지원: no-op
- 권한 거부 / 위치 조회 실패: 에러 콜백 조용히 무시, `mapStore.error` 변경 없음
- `initMap()` 실패로 `map === null`: `startWatchingLocation()` no-op

## 테스트 계획

### MapStore 단위 테스트 (`MapStore.test.ts`)

- `startWatchingLocation()` — `watchPosition` 호출 확인
- `startWatchingLocation()` — map이 null이면 `watchPosition` 미호출
- 위치 콜백 — 첫 번째 호출 시 `setCenter` 호출
- 위치 콜백 — 두 번째 호출 시 `setCenter` 미호출
- 위치 콜백 — 마커 생성 확인
- 위치 콜백 2회 — 마커 `setPosition` 호출 확인 (새 마커 미생성)
- `stopWatchingLocation()` — `clearWatch` 호출 + 마커 제거
- `stopWatchingLocation()` — watchId null이면 `clearWatch` 미호출
- `destroy()` — `clearWatch` 호출 확인

### GroupMapPage 컴포넌트 테스트 (`GroupMapPage.test.tsx`)

- `mockMapStore` 에 `startWatchingLocation: vi.fn()` 추가
- 지도 로드 후 `startWatchingLocation()` 호출 확인
