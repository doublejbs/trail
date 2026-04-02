# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

한글로 대화할것.

## 명령어

```bash
npm run dev          # 개발 서버 시작
npm run build        # 타입 체크(tsc -b) + Vite 빌드
npm run lint         # ESLint 실행
npm run test         # Vitest 워치 모드
npm run test:run     # Vitest 단일 실행
```

단일 테스트 파일 실행:
```bash
npx vitest run src/path/to/file.test.tsx
```

## 환경 변수

`.env.example`을 `.env.local`로 복사하고 아래 값을 채운다:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_NAVER_MAP_CLIENT_ID`
- `VITE_NAVER_MAP_CLIENT_SECRET` (Static Map API용, 선택)

## 아키텍처

**스택:** React 19 + TypeScript, React Router 7, MobX 6, Supabase, Tailwind CSS 4, shadcn/ui, Vitest.

**경로 별칭:** `@/*` → `src/*`

### 상태 관리 — MobX 스토어

**원칙:** 뷰 컴포넌트에는 JSX 렌더링만 남긴다. `useState`(데이터용), `useEffect`(데이터 fetch/사이드 이펙트), 이벤트 핸들러 로직은 모두 스토어로 이동한다.

- 스토어는 `makeAutoObservable()`을 사용하고 Supabase를 직접 호출한다.
- 비동기 작업 후 상태 변경은 반드시 `runInAction()`으로 감싼다.
- **액션 완료 후 navigate**가 필요한 스토어는 생성자에 `NavigateFunction`을 주입받는다.
- toast 호출도 스토어 내부에서 처리한다.

```typescript
// navigate가 필요한 스토어 패턴
class GroupCreateStore {
  submitting = false;
  error: string | null = null;

  constructor(private navigate: NavigateFunction) {
    makeAutoObservable(this);
  }

  async submit() {
    // ... Supabase 호출 ...
    runInAction(() => { this.submitting = false; });
    this.navigate('/group'); // 성공 시 navigate
  }
}

// 페이지 컴포넌트 패턴 — JSX 렌더링만 담당
export const GroupCreatePage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupCreateStore(navigate));

  return <form onSubmit={(e) => { e.preventDefault(); store.submit(); }}>...</form>;
});
```

**navigate 주입 패턴을 사용하는 스토어:** `AuthCallbackStore`, `JoinGroupStore`, `GroupCreateStore`, `GroupSettingsStore`, `GroupMapStore`, `LoginStore`.

**access control 리다이렉트** (권한 없음, 데이터 없음 등)는 컴포넌트 JSX에 `<Navigate>` 컴포넌트로 표현한다 — 스토어 상태를 읽어 조건부로 렌더링.

### 라우팅

라우트는 `src/App.tsx`에 정의된다. 인증이 필요한 라우트는 `<ProtectedRoute>`로 감싸져 있으며, `AuthStore`로 세션을 확인해 미인증 시 `/login?next=...`으로 리다이렉트한다.

주요 라우트: `/login`, `/auth/callback`, `/group`, `/group/new`, `/group/:id`, `/group/:id/settings`, `/course`, `/course/new`, `/course/:id`, `/history`, `/profile`.

### Supabase 클라이언트

`src/lib/supabase.ts`에 단일 클라이언트 인스턴스가 있다. 인증은 PKCE 플로우를 사용하며, OAuth 콜백은 `/auth/callback`에서 처리한다.

### 도메인 모델 — 코스, 그룹, 트래킹

**코스(Course):** GPX 파일 기반의 경로 정의. 업로드 시 거리/고도 계산, 네이버 지도 썸네일 자동 생성.

**그룹(Group):** 코스를 선택하거나 GPX를 직접 업로드하여 생성. `gpx_bucket` 필드로 스토리지 버킷 구분 (`course-gpx` 또는 `gpx-files`). 코스 선택 시 `gpx_path`와 `thumbnail_path`를 복사.

**트래킹(TrackingSession):** 그룹 내에서 사용자의 실시간 활동 기록. `status` 컬럼(`active`/`paused`/`completed`)으로 상태를 DB에 저장하여 새로고침 시 복원. `started_at`으로 경과 시간 계산.

### Supabase Storage 버킷

```
course-gpx/          # 코스 GPX + 썸네일
  {userId}/{courseId}.gpx
  {userId}/{courseId}_thumb.png

gpx-files/           # 그룹 직접 업로드 GPX + 썸네일
  {userId}/{groupId}.gpx
  {userId}/{groupId}_thumb.png
```

로드 시 `createSignedUrl(path, 3600)`으로 1시간 유효 URL을 생성한다.

### 썸네일 생성 (`src/lib/thumbnail.ts`)

`generateThumbnail(coords)` — 코스/그룹 생성 시 호출되는 공유 함수:
1. **네이버 Static Map API** (`maps.apigw.ntruss.com/map-static/v2/raster-cors`) 배경 이미지 요청
2. Canvas에 경로 오버레이 (Web Mercator 투영, adjust=2 보정)
3. 시작(녹색)/종료(빨강) 마커
4. API 실패 시 폴백: 회색 배경에 경로만 그림

### 네이버 지도

`index.html`에서 Naver Maps JS SDK 로드. `MapStore`가 래핑하여 경로 그리기, 위치 추적, 멤버 마커를 관리한다.

### 트래킹 시스템

**TrackingStore:** 상태 변경(start/pause/resume/stop)마다 즉시 DB UPDATE. 페이지 로드 시 `restore()`로 active/paused 세션 복원.

**실시간 순위:** Supabase Realtime broadcast 채널(`group-progress:{groupId}`)로 1초마다 진행률 전송. `LeaderboardStore`가 구독하여 실시간 순위 갱신.

### GPX 유틸리티

- `src/lib/gpx.ts` — GPX 파싱, 거리/고도 계산, SVG 포인트 변환, 고도 프로파일
- `src/utils/routeProjection.ts` — 코스 진행률 계산 (`maxRouteProgress`), Haversine 거리

### UI 컴포넌트

- `src/components/ui/` — shadcn/ui 기본 컴포넌트 (Button, Card 등)
- `src/components/` — 앱 전용 컴포넌트 (BottomTabBar, ProtectedRoute, CourseCard, CourseThumbnail 등)
- 모든 스타일링은 Tailwind 유틸리티 클래스 사용; CSS 모듈 없음
- 토스트 알림은 `sonner` 사용
- 디자인 톤: 블랙/화이트 미니멀, opacity 기반 계층 (`black/[0.06]` ~ `black/70`)

### 테스트

테스트 설정은 `src/test/setup.ts` (jsdom + `@testing-library/jest-dom`). 테스트 파일은 소스 파일과 같은 위치 또는 `src/test/`에 위치한다. 컴포넌트 테스트에는 React Testing Library를 사용한다.

### npm 설정

`.npmrc`에 `legacy-peer-deps=true` 설정. npm registry가 사내 Artifactory로 설정되어 있을 수 있으므로 패키지 설치 시 `--registry https://registry.npmjs.org/` 플래그가 필요할 수 있다.

## 코드베이스 레퍼런스

### 스토어 목록 (`src/stores/`)

| 파일 | 역할 | navigate 주입 |
|------|------|:---:|
| AuthStore | 세션 관리 | |
| AuthCallbackStore | OAuth 콜백 처리 | O |
| LoginStore | 로그인 | O |
| GroupStore | 그룹 목록 | |
| GroupCreateStore | 그룹 생성 | O |
| GroupMapStore | 그룹 지도/트래킹 | O |
| GroupSettingsStore | 그룹 설정 | O |
| GroupInviteStore | 초대 링크 | |
| JoinGroupStore | 그룹 참여 | O |
| CourseStore | 코스 목록 | |
| CourseDetailStore | 코스 상세 | |
| CourseUploadStore | 코스 업로드 | |
| MapStore | 네이버 지도 래퍼 | |
| TrackingStore | 실시간 위치 트래킹 | |
| LeaderboardStore | 실시간 순위 | |
| HistoryStore | 활동 기록 | |
| ProfileStore | 프로필 편집 | |

### MapStore 핵심 설정 (`src/stores/MapStore.ts`)

- `GAP_THRESHOLD = 150` (m) — 연속 포인트 간격이 150m 초과 시 별도 폴리라인 세그먼트로 분리
- `drawGpxRoute(gpxText)` — `trkpt` 요소 파싱, 세그먼트 분리, 시작(녹색)/종료(빨간) 핀 마커 생성
- `returnToCourse()` — `fitBounds`로 코스 전체 보기
- `startWatchingLocation()` — 내 위치 파란 점 마커 추적

### 타입 정의 (`src/types/`)

**Course:** `{ id, created_by, name, description, tags, gpx_path, thumbnail_path, distance_m, elevation_gain_m, is_public, created_at }`

**Group:** `{ id, name, created_by, gpx_path, gpx_bucket, thumbnail_path, created_at, max_members, period_started_at, period_ended_at }`
- `gpx_bucket`: `'course-gpx'` (코스 선택) 또는 `'gpx-files'` (GPX 직접 업로드)

**TrackingSession:** `{ id, user_id, group_id, elapsed_seconds, distance_meters, points: [{lat, lng, ts}], created_at }`

### 컴포넌트 (`src/components/`)

- `BottomTabBar` — 그룹/탐색/프로필 3탭, `env(safe-area-inset-bottom)` 적용
- `NavigationBar` — `ChevronLeft` 아이콘 뒤로가기 + 타이틀, min-height 48px
- `LargeTitle` — 26px extrabold, `calc(16px + env(safe-area-inset-top))` padding-top
- `CourseCard` — 수평 레이아웃, 96×96 썸네일
- `CourseThumbnail` — IntersectionObserver 기반 지연 로딩, 서명된 URL
- `ElevationChart` — 고도 프로파일, 검정 stroke/fill
- `ProtectedRoute` — 미인증 시 `/login?next=...` 리다이렉트

### 레이아웃 패턴

```tsx
// 고정 헤더 + 스크롤 본문 + 고정 푸터 (GroupCreatePage 등에서 사용)
<div className="h-full flex flex-col">
  <div className="shrink-0">헤더</div>
  <div className="flex-1 overflow-y-auto">본문</div>
  <div className="shrink-0">푸터</div>
</div>
```

### 디자인 토큰

- 배경: `bg-white`
- 포인트: `bg-black text-white`
- 보조 텍스트: `text-black/30` ~ `text-black/50`
- 테두리: `border-black/[0.06]` ~ `border-black/20`
- 칩 버튼: `px-4 py-1.5 rounded-full text-[13px] font-semibold min-h-0 min-w-0`
  - `min-h-0 min-w-0` 필수 — 전역 `button { min-height: 44px }` 오버라이드
- 카드: `rounded-2xl border border-black/[0.06]`
- 폰트: Plus Jakarta Sans (Google Fonts CDN, `index.html`)

### 모바일 Safari 설정 (`index.html` + `src/index.css`)

- viewport: `maximum-scale=1.0, user-scalable=no, viewport-fit=cover`
- `<meta name="theme-color" content="#ffffff">` + `<body style="background:#fff">`
- `html, body { height: 100dvh; overflow: hidden; overscroll-behavior: none; }`
- `input, textarea { font-size: 16px }` — iOS 자동 줌 방지
