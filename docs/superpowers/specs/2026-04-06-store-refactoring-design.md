# 스토어 리팩토링 디자인

## 목표

거대 스토어를 역할별로 분리하고, UI 상태와 비즈니스 로직의 경계를 명확히 하며, 코드 중복을 제거한다.

## 컨벤션

| 항목 | 규칙 |
|------|------|
| 컴포넌트 선언 | 화살표 함수 (`export const X = observer(() => { ... })`) |
| 비즈니스 스토어 | `~Store` 접미사, `src/stores/` |
| UI 스토어 | `~UIStore` 접미사, `src/stores/ui/` |
| toast | 스토어에서 직접 호출 OK |
| 에러 핸들링 | 통일 강제 안 함 |
| 스토어 분리 기준 | 역할별 분리 (하나의 스토어 = 하나의 명확한 책임) |
| 중복 로직 | 공유 스토어로 통합 |
| 페이지 컴포넌트 | JSX만, `useState`/`useEffect` 최소화 → UI 스토어로 이동 |

## 1. MapStore 분리 (현재 543줄)

현재 MapStore가 담당하는 역할: 네이버 지도 초기화, GPX 경로 그리기, 시작/종료/체크포인트 마커, 멤버 위치 마커, 내 위치 추적, fitBounds.

### 분리 결과

| 스토어 | 위치 | 역할 | 주요 메서드 |
|--------|------|------|-------------|
| `MapStore` | `src/stores/MapStore.ts` | 지도 인스턴스 관리, 초기화, 내 위치 추적 | `initMap()`, `startWatchingLocation()`, `returnToCourse()`, `fitBounds()` |
| `MapRenderingStore` | `src/stores/MapRenderingStore.ts` | 경로/마커/체크포인트 렌더링 | `drawGpxRoute()`, `drawCheckpoints()`, `clearRoute()` |
| `MemberMarkerStore` | `src/stores/MemberMarkerStore.ts` | 멤버 실시간 위치 마커 관리 | `updateMemberMarker()`, `removeMemberMarker()`, `clearAll()` |

### 의존 관계

- `MapRenderingStore`와 `MemberMarkerStore`는 `MapStore`의 지도 인스턴스를 참조로 받음.
- 각 스토어가 자신이 생성한 네이버 지도 오브젝트(폴리라인, 마커 등)의 라이프사이클을 책임짐.

## 2. TrackingStore 분리 (현재 449줄)

현재 TrackingStore가 담당하는 역할: 위치 추적, 세션 상태 관리(start/pause/resume/stop), 거리/경과시간 계산, 경로 진행률 계산, 체크포인트 방문 판정, Supabase Realtime broadcast, DB 저장.

### 분리 결과

| 스토어 | 위치 | 역할 | 주요 메서드/상태 |
|--------|------|------|-----------------|
| `TrackingStore` | `src/stores/TrackingStore.ts` | 세션 상태, 위치 추적, 거리/시간 계산, 체크포인트 판정, DB 저장 | `start()`, `pause()`, `resume()`, `stop()`, `restore()`, `maxRouteMeters`, `visitedCheckpointIds` |
| `TrackingBroadcastStore` | `src/stores/TrackingBroadcastStore.ts` | Realtime 채널 구독/전송 | `subscribe()`, `broadcast()`, `dispose()` |

### 의존 관계

- `TrackingBroadcastStore`는 `TrackingStore`의 상태를 읽어서 주기적으로 broadcast.
- 채널 생성/해제 라이프사이클을 독립적으로 관리.
- `TrackingStore`는 broadcast 존재를 모름 (단방향 의존).

## 3. UI 스토어 추출

### GroupMapUIStore

GroupMapPage의 `useState` 6개 + `useEffect` 오케스트레이션을 스토어로 이동:

```typescript
// src/stores/ui/GroupMapUIStore.ts
class GroupMapUIStore {
  activeTab: 'map' | 'leaderboard' = 'map';
  showElevation = false;
  showRestartConfirm = false;
  showCountdown = false;
  starting = false;
  resetting = false;

  constructor() {
    makeAutoObservable(this);
  }

  // 페이지 초기화 오케스트레이션 로직도 여기로
  async init(groupId: string) { ... }
}
```

### CourseDetailUIStore

CourseDetailPage의 UI 상태를 스토어로 이동:

```typescript
// src/stores/ui/CourseDetailUIStore.ts
class CourseDetailUIStore {
  gpxText: string | null | undefined = undefined;
  showCreateSheet = false;
  sheetVisible = false;

  constructor() {
    makeAutoObservable(this);
  }
}
```

### ProfilePage

소규모이므로 현 단계에서는 스킵. 필요 시 추후 추가.

## 4. QuickGroupCreateStore 통합

### 현재 문제

`CourseDetailPage.tsx`에 `QuickGroupCreateStore`가 인라인으로 정의되어 있으며 (77줄), `GroupCreateStore`의 체크포인트 생성 로직과 중복됨.

### 해결

- `QuickGroupCreateStore` 제거.
- `GroupCreateStore`에 `createFromCourse(courseId: string)` 메서드 추가.
- 체크포인트 생성 로직(시작/종료 자동 생성)은 `GroupCreateStore` 안에 한 곳으로 통합.
- `CourseDetailPage`는 `GroupCreateStore`를 사용.

## 5. 컴포넌트 화살표 함수 전환

모든 리액트 컴포넌트를 `function` 키워드에서 화살표 함수로 전환:

```tsx
// Before
function GroupCard({ group }: Props) { ... }
export default function LoginPage() { ... }

// After
const GroupCard = ({ group }: Props) => { ... };
export const LoginPage = observer(() => { ... });
```

- `export default function` → `export const`로 named export 전환.
- 이 과정에서 import 경로도 함께 업데이트.

## 실행 순서

1. MapStore 분리 (`MapStore` → `MapStore` + `MapRenderingStore` + `MemberMarkerStore`)
2. TrackingStore 분리 (`TrackingStore` → `TrackingStore` + `TrackingBroadcastStore`)
3. GroupMapPage UI 스토어 추출 (`GroupMapUIStore`)
4. QuickGroupCreateStore → GroupCreateStore 통합
5. CourseDetailPage UI 스토어 추출 (`CourseDetailUIStore`)
6. 전체 컴포넌트 화살표 함수 전환
7. CLAUDE.md 컨벤션 업데이트

## 영향받는 파일

### 새로 생성
- `src/stores/MapRenderingStore.ts`
- `src/stores/MemberMarkerStore.ts`
- `src/stores/TrackingBroadcastStore.ts`
- `src/stores/ui/GroupMapUIStore.ts`
- `src/stores/ui/CourseDetailUIStore.ts`

### 수정
- `src/stores/MapStore.ts` — 렌더링/멤버마커 로직 제거
- `src/stores/TrackingStore.ts` — broadcast 로직 제거
- `src/stores/GroupCreateStore.ts` — `createFromCourse()` 추가, 체크포인트 로직 통합
- `src/pages/GroupMapPage.tsx` — useState/useEffect 제거, UI 스토어 사용
- `src/pages/CourseDetailPage.tsx` — QuickGroupCreateStore 제거, UI 스토어 사용
- `src/pages/*.tsx` — 화살표 함수 전환
- `src/components/*.tsx` — 화살표 함수 전환
- `CLAUDE.md` — 새 컨벤션 반영
