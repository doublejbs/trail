# Trail — 메인 화면 디자인 스펙

## 개요

로그인 후 진입하는 메인 화면이다. 전체 화면을 네이버 지도가 차지하고, 하단에 iOS 최신 스타일의 탭바가 고정된다. 이번 스펙은 지도 탭과 탭바 UI 구현에 집중한다.

## 기술 스택

- **Frontend:** Vite + React 19, TypeScript, React Router v7
- **지도:** Naver Maps JavaScript API v3
- **UI:** shadcn/ui + Tailwind CSS (neutral 팔레트)
- **상태:** 기존 AuthContext 그대로 사용

## 라우팅 구조

React Router v7의 `BrowserRouter` + `Routes` + `Route` (기존 방식) 그대로 유지하며 중첩 라우트를 추가한다.

```
/ (ProtectedRoute element로 감싼 Route)
└── MainLayout (<Outlet> 포함)
    ├── index           → MapPage      (지도)
    ├── group           → GroupPage    (그룹 — 플레이스홀더)
    ├── history         → HistoryPage  (기록 — 플레이스홀더)
    └── profile         → ProfilePage  (프로필 — 플레이스홀더)
```

### App.tsx 라우트 구조

```tsx
<Route
  path="/"
  element={
    <ProtectedRoute>
      <MainLayout />
    </ProtectedRoute>
  }
>
  <Route index element={<MapPage />} />
  <Route path="group" element={<GroupPage />} />
  <Route path="history" element={<HistoryPage />} />
  <Route path="profile" element={<ProfilePage />} />
</Route>
```

기존 `HomePage.tsx`는 삭제한다. 로그아웃 기능은 `ProfilePage`의 플레이스홀더에 포함한다 (로그아웃 버튼).

## 파일 구조

```
src/
├── pages/
│   ├── MainLayout.tsx       # 탭바 + <Outlet> 레이아웃
│   ├── MapPage.tsx          # 네이버 지도 전체화면
│   ├── GroupPage.tsx        # 플레이스홀더
│   ├── HistoryPage.tsx      # 플레이스홀더
│   └── ProfilePage.tsx      # 플레이스홀더 (로그아웃 버튼 포함)
├── components/
│   └── BottomTabBar.tsx     # 하단 탭바 컴포넌트
└── hooks/
    └── useNaverMap.ts       # 네이버 지도 초기화 훅
```

삭제: `src/pages/HomePage.tsx`

## 컴포넌트 설계

### MainLayout

- `<div className="flex flex-col h-screen">` 구조
- `<Outlet />` 영역: `flex-1 relative overflow-hidden` — 지도가 가득 채움
- `<BottomTabBar />` 하단 고정
- `useLocation()`으로 현재 경로를 읽어 활성 탭 결정

### BottomTabBar

```ts
interface Tab {
  path: string        // '/', '/group', '/history', '/profile'
  label: string       // '지도', '그룹', '기록', '프로필'
  icon: ReactNode
}
```

**활성 탭 판별 로직:**
- 지도 탭(`/`): `location.pathname === '/'` (정확히 일치)
- 나머지 탭: `location.pathname.startsWith(tab.path)` (하위 경로 포함)

**스타일:**
- 배경: `bg-black` (솔리드 블랙, 반투명 없음)
- 상단 구분선: `border-t border-[#222]`
- 활성 탭 아이콘/텍스트: `#FFFFFF`
- 비활성 탭: `#555555`
- 홈 인디케이터 영역: 검정 배경에 흰색 pill (`w-[100px] h-[4px] bg-white/30`)
- `useNavigate()`로 탭 전환
- 각 탭 터치 영역: `min-w-[52px]`, 아이콘 22px (lucide-react)

### MapPage

- 전체 화면: `w-full h-full` (MainLayout의 flex-1을 가득 채움)
- `useNaverMap` 훅 사용
- 지도 div `ref` 전달 → 훅이 `naver.maps.Map` 인스턴스 초기화
- 내 위치 버튼: 지도 우측 하단 floating (`absolute right-3 bottom-3`)
- 지도 로드 실패 시: "지도를 불러올 수 없습니다" 텍스트 표시

### useNaverMap

```ts
function useNaverMap(ref: RefObject<HTMLDivElement>): {
  map: naver.maps.Map | null
  error: boolean   // true = 초기화 시도했으나 실패
}
```

- `ref.current`가 준비되고 `window.naver`가 존재하면 `new naver.maps.Map()` 초기화
- `window.naver` 미존재 또는 `new naver.maps.Map()` throw 시 `error: true` 반환
- `map === null && error === false` → 초기화 전(로딩 중)
- `map !== null` → 초기화 성공
- `error === true` → 초기화 실패 → MapPage가 에러 메시지 표시
- Naver Maps 스크립트는 `index.html`에서 `defer` 없이 동기 로드 → 컴포넌트 마운트 시점에 `window.naver` 사용 가능
- 초기 중심: 서울 (37.5665, 126.9780), zoom: 14
- `VITE_NAVER_MAP_CLIENT_ID` 미설정 시: 콘솔 경고 출력, 지도 초기화 건너뜀 (`error: true`)
- 컴포넌트 언마운트 시 cleanup 없음 (Naver Maps SDK 특성)

### 플레이스홀더 페이지

- **GroupPage, HistoryPage:** 탭 이름 + "준비 중" 텍스트
- **ProfilePage:** 탭 이름 + "준비 중" 텍스트 + **로그아웃 버튼** (`useAuth().signOut()` 호출)
- 레이아웃: `flex h-full flex-col items-center justify-center gap-4`

## shadcn/ui 컴포넌트 사용

모든 인터랙티브 UI 요소는 shadcn/ui 컴포넌트를 사용한다.

| 위치 | 컴포넌트 | 설치 여부 |
|------|----------|----------|
| ProfilePage 로그아웃 버튼 | `Button` (variant="outline") | 기설치 |
| MapPage 내 위치 버튼 | `Button` (variant="secondary", size="icon") | 기설치 |
| 에러 상태 텍스트 | 기본 Tailwind 텍스트 (shadcn 불필요) | — |

`BottomTabBar`는 shadcn 컴포넌트가 없으므로 Tailwind 클래스로 직접 구현한다.

## 네이버 지도 설정

### index.html 스크립트 추가

Vite는 `index.html`에서 `%VITE_..%` 환경변수 치환을 기본 지원한다 (`vite-plugin-html` 불필요).

```html
<script
  type="text/javascript"
  src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=%VITE_NAVER_MAP_CLIENT_ID%"
></script>
```

### 환경 변수 추가

`.env.local` 및 `.env.example`에 추가:
```env
VITE_NAVER_MAP_CLIENT_ID=your-naver-map-client-id
```

### TypeScript 타입

```bash
npm install -D @types/navermaps
```

`@types/navermaps`를 `devDependencies`에 추가하여 `naver.maps.*` 타입 지원.

## UI 디자인

| 요소 | 스타일 |
|------|--------|
| 탭바 배경 | `#000000` (솔리드 블랙) |
| 탭바 상단 보더 | `#222222` |
| 활성 아이콘/텍스트 | `#FFFFFF` |
| 비활성 아이콘/텍스트 | `#555555` |
| 홈 인디케이터 | `rgba(255,255,255,0.3)`, 100px × 4px |
| 아이콘 크기 | 22px × 22px (lucide-react) |
| 텍스트 크기 | 9px, font-weight 600 (활성) / 400 (비활성) |

## 에러 처리

| 상황 | 처리 |
|------|------|
| Naver Maps 스크립트 로드 실패 | 지도 영역에 "지도를 불러올 수 없습니다" 텍스트 표시 |
| `VITE_NAVER_MAP_CLIENT_ID` 미설정 | 콘솔 경고, 지도 초기화 건너뜀 |

## 범위 외 (이번 스펙 제외)

- 그룹 멤버 실시간 위치 마커
- 그룹 생성/참여 플로우
- 기록 화면 (등산 기록 목록)
- 프로필 화면 상세 (유저 정보 편집 등)
- 지도 위 정보 패널 / 바텀 시트
