# 코스 진입 뷰 + 코스로 돌아가기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹 상세 진입 시 코스 위치를 먼저 보여주고, 지도를 이동해 코스가 화면에서 벗어나면 "코스로 돌아가기" 버튼을 표시한다.

**Architecture:** `MapStore.startWatchingLocation()`에서 지도 이동 로직을 제거해 진입 시 코스가 유지되도록 한다. `drawGpxRoute()`에서 GPX 경로의 bounds를 계산하고 Naver Maps `idle` 이벤트로 가시성을 추적한다. `GroupMapPage`에 `isCourseVisible === false`일 때만 나타나는 버튼을 추가한다.

**Tech Stack:** MobX 6 (makeAutoObservable, observable.ref, runInAction), Naver Maps SDK v3 (LatLngBounds, Event.addListener, map.fitBounds), Vitest, React Testing Library

---

## 파일 구조

- Modify: `src/stores/MapStore.ts` — `hasInitialCenter` 제거, `gpxBounds` / `isCourseVisible` / `idleListener` 추가, `returnToCourse()` 추가
- Modify: `src/stores/MapStore.test.ts` — 변경된 동작 반영, 새 테스트 추가
- Modify: `src/pages/GroupMapPage.tsx` — "코스로 돌아가기" 버튼 추가
- Modify: `src/pages/GroupMapPage.test.tsx` — 버튼 표시/클릭 테스트 추가

---

### Task 1: `hasInitialCenter` 제거

**Files:**
- Modify: `src/stores/MapStore.ts`
- Modify: `src/stores/MapStore.test.ts`

- [ ] **Step 1: 테스트 수정 — `setCenter` 미호출 검증으로 변경**

`MapStore.test.ts`의 `describe('startWatchingLocation()')` 블록에서:

**`'첫 번째 위치 콜백에서 setCenter 호출'` 테스트를 아래로 교체:**

```ts
it('위치 콜백에서 setCenter 미호출', () => {
  watchSpy.mockImplementation((cb) => {
    cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
    return 42;
  });
  store.startWatchingLocation();
  expect(mockMap.setCenter).not.toHaveBeenCalled();
});
```

**`'두 번째 위치 콜백에서 setCenter 미호출'` 테스트 전체 삭제** (더 이상 의미 없음).

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```

Expected: `위치 콜백에서 setCenter 미호출` FAIL (구현이 아직 setCenter를 호출하므로)

- [ ] **Step 3: `MapStore.ts` 구현 수정**

`private hasInitialCenter: boolean = false;` 줄 삭제.

`startWatchingLocation()` 콜백에서 아래 블록 삭제:

```ts
if (!this.hasInitialCenter) {
  this.map!.setCenter(latLng);
  this.hasInitialCenter = true;
}
```

`stopWatchingLocation()`에서 `this.hasInitialCenter = false;` 줄 삭제.

- [ ] **Step 4: 테스트 재실행 — 통과 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋하지 않음** — Task 2와 함께 커밋한다.

---

### Task 2: `gpxBounds` + `isCourseVisible` + idle 이벤트

**Files:**
- Modify: `src/stores/MapStore.ts`
- Modify: `src/stores/MapStore.test.ts`

- [ ] **Step 1: `mockMap`에 `fitBounds`, `getBounds` 추가**

`MapStore.test.ts` 상단의 `mockMap` 정의를 수정:

```ts
const mockMap = { setCenter: vi.fn(), destroy: vi.fn(), fitBounds: vi.fn(), getBounds: vi.fn() };
```

- [ ] **Step 2: 새 테스트 블록 추가**

`MapStore.test.ts`의 `describe('stopWatchingLocation()')` 블록 바로 아래에 추가 (같은 depth, `describe('MapStore')` 안):

```ts
describe('gpxBounds 및 isCourseVisible', () => {
  let mockBounds: { extend: ReturnType<typeof vi.fn>; intersects: ReturnType<typeof vi.fn> };
  let idleCallback: (() => void) | null;

  beforeEach(() => {
    mockBounds = { extend: vi.fn().mockReturnThis(), intersects: vi.fn().mockReturnValue(true) };
    idleCallback = null;
    (mockNaverMaps as Record<string, unknown>).LatLngBounds = vi.fn(function () { return mockBounds; });
    (mockNaverMaps as Record<string, unknown>).Event = {
      addListener: vi.fn((_map: unknown, event: string, cb: () => void) => {
        if (event === 'idle') idleCallback = cb;
        return { id: 'idle-listener' };
      }),
      removeListener: vi.fn(),
    };
    mockNaverMaps.Polyline.mockImplementation(function () { return mockPolyline; });
    (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
    store = new MapStore();
    store.initMap(document.createElement('div'));
  });

  it('drawGpxRoute 성공 후 LatLngBounds 생성', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    expect((mockNaverMaps as Record<string, unknown>).LatLngBounds).toHaveBeenCalled();
  });

  it('drawGpxRoute 성공 후 idle 이벤트 리스너 등록', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    expect(((mockNaverMaps as Record<string, unknown>).Event as { addListener: ReturnType<typeof vi.fn> }).addListener)
      .toHaveBeenCalledWith(mockMap, 'idle', expect.any(Function));
  });

  it('idle 콜백 — intersects false이면 isCourseVisible=false', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    mockMap.getBounds.mockReturnValue({ intersects: vi.fn().mockReturnValue(false) });
    idleCallback!();
    expect(store.isCourseVisible).toBe(false);
  });

  it('idle 콜백 — intersects true이면 isCourseVisible=true', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    mockMap.getBounds.mockReturnValue({ intersects: vi.fn().mockReturnValue(true) });
    store.isCourseVisible = false; // 먼저 false로 설정
    idleCallback!();
    expect(store.isCourseVisible).toBe(true);
  });

  it('clearGpxRoute 후 isCourseVisible=true 복원', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    store.isCourseVisible = false;
    store.clearGpxRoute();
    expect(store.isCourseVisible).toBe(true);
  });

  it('clearGpxRoute 후 idle 리스너 제거', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    store.clearGpxRoute();
    expect(((mockNaverMaps as Record<string, unknown>).Event as { removeListener: ReturnType<typeof vi.fn> }).removeListener)
      .toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```

Expected: 새 6개 테스트 FAIL (`isCourseVisible is not a function / undefined`)

- [ ] **Step 4: `MapStore.ts` 필드 추가**

기존 `public locationMarker` 줄 아래에 추가:

```ts
public isCourseVisible: boolean = true;
private gpxBounds: naver.maps.LatLngBounds | null = null;
private idleListener: naver.maps.MapEventListener | null = null;
```

`makeAutoObservable` 옵션에는 추가하지 않는다 — `isCourseVisible`은 일반 observable (primitive), `gpxBounds`와 `idleListener`는 private이므로 observable 필요 없음.

- [ ] **Step 5: `drawGpxRoute()` 수정**

`drawGpxRoute()` 내에서 `this.map.setCenter(path[0]);` 줄 바로 다음에 추가:

```ts
// gpxBounds 계산
const bounds = path.reduce(
  (b, pt) => b.extend(pt),
  new window.naver.maps.LatLngBounds(path[0], path[0]),
);
this.gpxBounds = bounds;

// 기존 idle 리스너 정리 후 재등록
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

- [ ] **Step 6: `clearGpxRoute()` 수정**

`clearGpxRoute()` 맨 앞에 추가:

```ts
if (this.idleListener) {
  window.naver.maps.Event.removeListener(this.idleListener);
  this.idleListener = null;
}
this.gpxBounds = null;
this.isCourseVisible = true;
```

- [ ] **Step 7: 테스트 재실행 — 통과 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```

Expected: 모든 테스트 PASS

- [ ] **Step 8: Task 1 + 2 커밋**

```bash
git add src/stores/MapStore.ts src/stores/MapStore.test.ts
git commit -m "feat: MapStore — 코스 진입 뷰 고정 + isCourseVisible 감지"
```

---

### Task 3: `returnToCourse()` 구현

**Files:**
- Modify: `src/stores/MapStore.ts`
- Modify: `src/stores/MapStore.test.ts`

- [ ] **Step 1: 테스트 추가**

`describe('gpxBounds 및 isCourseVisible')` 바로 아래에 추가:

```ts
describe('returnToCourse()', () => {
  beforeEach(() => {
    const mockBounds = { extend: vi.fn().mockReturnThis(), intersects: vi.fn().mockReturnValue(true) };
    (mockNaverMaps as Record<string, unknown>).LatLngBounds = vi.fn(function () { return mockBounds; });
    (mockNaverMaps as Record<string, unknown>).Event = {
      addListener: vi.fn().mockReturnValue({ id: 'idle-listener' }),
      removeListener: vi.fn(),
    };
    mockNaverMaps.Polyline.mockImplementation(function () { return mockPolyline; });
    (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
    store = new MapStore();
    store.initMap(document.createElement('div'));
  });

  it('gpxBounds가 있으면 fitBounds 호출', () => {
    store.drawGpxRoute(GPX_TWO_POINTS);
    store.returnToCourse();
    expect(mockMap.fitBounds).toHaveBeenCalledOnce();
  });

  it('gpxBounds가 null이면 fitBounds 미호출', () => {
    // drawGpxRoute 미호출 상태
    store.returnToCourse();
    expect(mockMap.fitBounds).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/stores/MapStore.test.ts
```

Expected: `returnToCourse is not a function` 오류로 실패

- [ ] **Step 3: `returnToCourse()` 구현**

`stopWatchingLocation()` 바로 아래에 추가:

```ts
public returnToCourse(): void {
  if (!this.map || !this.gpxBounds) return;
  this.map.fitBounds(this.gpxBounds, { top: 50, right: 50, bottom: 50, left: 50 });
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
git commit -m "feat: MapStore — returnToCourse() 추가"
```

---

### Task 4: GroupMapPage — "코스로 돌아가기" 버튼

**Files:**
- Modify: `src/pages/GroupMapPage.tsx`
- Modify: `src/pages/GroupMapPage.test.tsx`

- [ ] **Step 1: `mockMapStore`에 새 필드 추가 + 테스트 작성**

`GroupMapPage.test.tsx`의 `mockMapStore` 객체에 두 필드 추가:

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
    startWatchingLocation: vi.fn(),
    isCourseVisible: true,        // 추가
    returnToCourse: vi.fn(),      // 추가
  },
  mockNavigate: vi.fn(),
}));
```

`beforeEach` 블록에 리셋 추가:

```ts
beforeEach(() => {
  mockMapStore.map = null;
  mockMapStore.error = false;
  mockMapStore.isCourseVisible = true;   // 추가
  vi.clearAllMocks();
  // ... 기존 내용 유지
});
```

기존 describe 블록 안에 테스트 3개 추가:

```ts
it('isCourseVisible=false이면 코스로 돌아가기 버튼 표시', async () => {
  mockMapStore.map = {} as naver.maps.Map;
  mockMapStore.isCourseVisible = false;
  renderAt('/group/group-uuid-1');
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /코스로 돌아가기/i })).toBeInTheDocument();
  });
});

it('isCourseVisible=true이면 코스로 돌아가기 버튼 미표시', async () => {
  mockMapStore.isCourseVisible = true;
  renderAt('/group/group-uuid-1');
  await waitFor(() => screen.getByTestId('map-container'));
  expect(screen.queryByRole('button', { name: /코스로 돌아가기/i })).not.toBeInTheDocument();
});

it('코스로 돌아가기 버튼 클릭 시 returnToCourse 호출', async () => {
  mockMapStore.map = {} as naver.maps.Map;
  mockMapStore.isCourseVisible = false;
  renderAt('/group/group-uuid-1');
  await waitFor(() => screen.getByRole('button', { name: /코스로 돌아가기/i }));
  fireEvent.click(screen.getByRole('button', { name: /코스로 돌아가기/i }));
  expect(mockMapStore.returnToCourse).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```

Expected: 새 3개 테스트 FAIL

- [ ] **Step 3: `GroupMapPage.tsx`에 버튼 추가**

기존 "내 위치 버튼" 블록(`{mapStore.map && (...)`) 바로 위에 추가:

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

- [ ] **Step 4: 전체 테스트 통과 확인**

```bash
npm run test:run
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/pages/GroupMapPage.tsx src/pages/GroupMapPage.test.tsx
git commit -m "feat: GroupMapPage — 코스로 돌아가기 버튼 추가"
```
