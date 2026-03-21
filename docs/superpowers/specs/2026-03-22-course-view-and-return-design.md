# 코스 진입 뷰 + 코스로 돌아가기 설계

## 개요

그룹 상세(지도) 페이지에서 두 가지 UX를 개선한다:
1. 진입 시 현재 위치 대신 코스 위치를 먼저 보여준다.
2. 사용자가 지도를 이동해 코스가 뷰포트 밖으로 벗어나면 "코스로 돌아가기" 버튼을 표시한다.

## 범위

- `src/stores/MapStore.ts` — `startWatchingLocation` 수정, `isCourseVisible` + `returnToCourse` 추가
- `src/stores/MapStore.test.ts` — 변경된 동작 반영
- `src/pages/GroupMapPage.tsx` — "코스로 돌아가기" 버튼 추가
- `src/pages/GroupMapPage.test.tsx` — 버튼 표시 테스트 추가

## MapStore 변경

### 제거: `hasInitialCenter`

`private hasInitialCenter: boolean = false` 필드를 삭제한다.

`startWatchingLocation()` 콜백에서 `setCenter` 블록 전체를 제거한다:

```ts
// 제거 대상
if (!this.hasInitialCenter) {
  this.map!.setCenter(latLng);
  this.hasInitialCenter = true;
}
```

`stopWatchingLocation()`에서 `this.hasInitialCenter = false;` 라인을 제거한다.

결과적으로 `startWatchingLocation()`은 지도를 이동시키지 않고 위치 마커만 표시/업데이트한다. 진입 시 지도 중심은 `drawGpxRoute()`가 `map.setCenter(path[0])`로 설정한 코스 시작점이 된다.

### 새 필드

```ts
private gpxBounds: naver.maps.LatLngBounds | null = null;
private idleListener: naver.maps.MapEventListener | null = null;
public isCourseVisible: boolean = true;
```

`makeAutoObservable` 옵션:

```ts
makeAutoObservable(this, {
  map: observable.ref,
  gpxPolyline: observable.ref,
  startMarker: observable.ref,
  endMarker: observable.ref,
  locationMarker: observable.ref,
  // isCourseVisible은 일반 observable (기본값) — ref 불필요
});
```

### `drawGpxRoute()` 변경

polyline을 그린 직후(기존 `this.map.setCenter(path[0])` 다음)에 아래를 추가한다:

```ts
// gpxBounds 계산
const bounds = path.reduce(
  (b, pt) => b.extend(pt),
  new window.naver.maps.LatLngBounds(path[0], path[0]),
);
this.gpxBounds = bounds;

// 기존 idle 리스너 제거 후 재등록 (drawGpxRoute 재호출 시 중복 방지)
if (this.idleListener) {
  window.naver.maps.Event.removeListener(this.idleListener);
}
this.idleListener = window.naver.maps.Event.addListener(
  this.map,
  'idle',
  () => {
    if (!this.map || !this.gpxBounds) return;
    const mapBounds = this.map.getBounds() as naver.maps.LatLngBounds;
    runInAction(() => {
      this.isCourseVisible = mapBounds.intersects(this.gpxBounds!);
    });
  },
);
```

### `clearGpxRoute()` 변경

기존 정리 로직 앞에 추가:

```ts
if (this.idleListener) {
  window.naver.maps.Event.removeListener(this.idleListener);
  this.idleListener = null;
}
this.gpxBounds = null;
this.isCourseVisible = true;
```

### `returnToCourse()` 신규

```ts
public returnToCourse(): void {
  if (!this.map || !this.gpxBounds) return;
  this.map.fitBounds(this.gpxBounds, { top: 50, right: 50, bottom: 50, left: 50 });
}
```

## GroupMapPage 변경

`mapStore.map && (...)` 블록 바로 위에 "코스로 돌아가기" 버튼 추가:

```tsx
{mapStore.map && !mapStore.isCourseVisible && (
  <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
    <button
      onClick={() => mapStore.returnToCourse()}
      className="bg-white/90 text-black px-4 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap"
    >
      코스로 돌아가기
    </button>
  </div>
)}
```

## 에러 처리

- `gpxBounds`가 null인 상태에서 idle 이벤트 콜백이 실행되는 경우: `if (!this.gpxBounds) return;` 가드로 방어.
- `map.fitBounds` 미지원 환경: 실제 네이버 지도 SDK에 존재하므로 별도 처리 불필요.
- GPX 파싱 실패 시 `drawGpxRoute()`는 `error = true`만 설정하고 반환하므로 `gpxBounds`는 null 유지, 버튼 미표시.

## 테스트 계획

### MapStore 단위 테스트

**`startWatchingLocation()` 변경:**
- 위치 콜백에서 `setCenter` 미호출 확인 (기존 "첫 번째 위치 콜백에서 setCenter 호출" 테스트 → 반대로 미호출 검증으로 변경)
- 기존 `hasInitialCenter` 관련 테스트 모두 제거

**`drawGpxRoute()` 변경:**
- GPX 파싱 성공 후 `gpxBounds`가 null이 아님 확인
- idle 이벤트 리스너 등록 확인

**`clearGpxRoute()` 변경:**
- `gpxBounds === null`, `isCourseVisible === true` 확인
- idle 이벤트 리스너 제거 확인 (`removeListener` 호출)

**`returnToCourse()`:**
- `map.fitBounds` 호출 확인
- `gpxBounds`가 null이면 `fitBounds` 미호출

### GroupMapPage 컴포넌트 테스트

- `mockMapStore`에 `isCourseVisible`, `returnToCourse` mock 추가
- `isCourseVisible = false`이면 "코스로 돌아가기" 버튼 표시
- `isCourseVisible = true`이면 버튼 미표시
- 버튼 클릭 시 `returnToCourse()` 호출
