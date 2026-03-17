# Main Screen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 후 진입하는 메인 화면 구현 — 전체화면 네이버 지도 + iOS 스타일 솔리드 블랙 하단 탭바 (지도·그룹·기록·프로필).

**Architecture:** React Router v7 중첩 라우트로 MainLayout(탭바 + Outlet)을 구성하고, MapPage에서 useNaverMap 훅으로 네이버 지도를 초기화한다. ProtectedRoute가 MainLayout을 감싸고, 나머지 3탭은 플레이스홀더로 구현한다.

**Tech Stack:** Vite + React 19 + TypeScript, React Router v7, Naver Maps JS API v3 (@types/navermaps), shadcn/ui (Button), Tailwind CSS, Vitest + React Testing Library

---

## File Map

| File | 역할 | 상태 |
|------|------|------|
| `src/hooks/useNaverMap.ts` | 네이버 지도 초기화 훅 | 신규 |
| `src/hooks/useNaverMap.test.ts` | useNaverMap 테스트 | 신규 |
| `src/components/BottomTabBar.tsx` | 하단 탭바 컴포넌트 | 신규 |
| `src/components/BottomTabBar.test.tsx` | BottomTabBar 테스트 | 신규 |
| `src/pages/MainLayout.tsx` | 탭바 + Outlet 레이아웃 | 신규 |
| `src/pages/MainLayout.test.tsx` | MainLayout 테스트 | 신규 |
| `src/pages/MapPage.tsx` | 네이버 지도 전체화면 | 신규 |
| `src/pages/MapPage.test.tsx` | MapPage 테스트 | 신규 |
| `src/pages/GroupPage.tsx` | 그룹 탭 플레이스홀더 | 신규 |
| `src/pages/HistoryPage.tsx` | 기록 탭 플레이스홀더 | 신규 |
| `src/pages/ProfilePage.tsx` | 프로필 탭 (로그아웃 버튼 포함) | 신규 |
| `src/pages/ProfilePage.test.tsx` | ProfilePage 테스트 | 신규 |
| `src/App.tsx` | 중첩 라우트로 교체 | 수정 |
| `src/pages/HomePage.tsx` | 삭제 | 삭제 |
| `index.html` | 네이버 지도 스크립트 추가 | 수정 |
| `.env.local` | VITE_NAVER_MAP_CLIENT_ID 추가 | 수정 |
| `.env.example` | VITE_NAVER_MAP_CLIENT_ID 추가 | 수정 |

---

## Chunk 1: 인프라 + 핵심 컴포넌트

### Task 1: 네이버 지도 의존성 및 환경 설정

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `index.html`
- Modify: `.env.local`
- Modify: `.env.example`

- [ ] **Step 1: @types/navermaps 설치**

```bash
cd /Users/user/Documents/GitHub/trail
npm install -D @types/navermaps
```

Expected: `@types/navermaps` 가 `devDependencies`에 추가됨.

- [ ] **Step 2: index.html에 네이버 지도 스크립트 추가**

`index.html`의 `</head>` 바로 앞에 추가:

```html
<script
  type="text/javascript"
  src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=%VITE_NAVER_MAP_CLIENT_ID%"
></script>
```

Vite는 `index.html`에서 `%VITE_..%` 환경변수를 빌드 시 자동 치환한다.

- [ ] **Step 3: 환경변수 추가**

`.env.local`에 추가:
```env
VITE_NAVER_MAP_CLIENT_ID=your-naver-map-client-id
```

`.env.example`에 추가:
```env
VITE_NAVER_MAP_CLIENT_ID=your-naver-map-client-id
```

- [ ] **Step 4: 빌드 확인**

```bash
npm run build
```
Expected: 빌드 성공, 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add index.html package.json package-lock.json .env.example
git commit -m "chore: add Naver Maps SDK and @types/navermaps"
```

---

### Task 2: useNaverMap 훅 (TDD)

**Files:**
- Create: `src/hooks/useNaverMap.ts`
- Create: `src/hooks/useNaverMap.test.ts`

- [ ] **Step 1: 테스트 작성**

Create `src/hooks/useNaverMap.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useNaverMap } from './useNaverMap'

const mockMap = { setCenter: vi.fn() }
const mockNaverMaps = {
  Map: vi.fn(() => mockMap),
  LatLng: vi.fn((lat, lng) => ({ lat, lng })),
}

describe('useNaverMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // window.naver 정리
    delete (window as Record<string, unknown>).naver
  })

  it('window.naver 없으면 error=true 반환', () => {
    delete (window as Record<string, unknown>).naver
    const div = document.createElement('div')
    const { result } = renderHook(() => {
      const ref = { current: div }
      return useNaverMap(ref as React.RefObject<HTMLDivElement>)
    })
    expect(result.current.map).toBeNull()
    expect(result.current.error).toBe(true)
  })

  it('window.naver 있으면 지도 초기화', () => {
    ;(window as Record<string, unknown>).naver = { maps: mockNaverMaps }
    const div = document.createElement('div')
    const { result } = renderHook(() => {
      const ref = { current: div }
      return useNaverMap(ref as React.RefObject<HTMLDivElement>)
    })
    expect(mockNaverMaps.Map).toHaveBeenCalledWith(div, expect.objectContaining({
      zoom: 14,
    }))
    expect(result.current.map).toBe(mockMap)
    expect(result.current.error).toBe(false)
  })

  it('naver.maps.Map 생성자 throw 시 error=true', () => {
    mockNaverMaps.Map.mockImplementationOnce(() => { throw new Error('init fail') })
    ;(window as Record<string, unknown>).naver = { maps: mockNaverMaps }
    const div = document.createElement('div')
    const { result } = renderHook(() => {
      const ref = { current: div }
      return useNaverMap(ref as React.RefObject<HTMLDivElement>)
    })
    expect(result.current.map).toBeNull()
    expect(result.current.error).toBe(true)
  })

  it('ref.current가 null이면 초기화 안 함', () => {
    ;(window as Record<string, unknown>).naver = { maps: mockNaverMaps }
    const { result } = renderHook(() => {
      const ref = { current: null }
      return useNaverMap(ref as React.RefObject<HTMLDivElement>)
    })
    expect(mockNaverMaps.Map).not.toHaveBeenCalled()
    expect(result.current.map).toBeNull()
    expect(result.current.error).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test:run -- src/hooks/useNaverMap.test.ts
```
Expected: FAIL — `useNaverMap` not found.

- [ ] **Step 3: useNaverMap 구현**

Create `src/hooks/useNaverMap.ts`:
```ts
import { RefObject, useEffect, useState } from 'react'

interface UseNaverMapResult {
  map: naver.maps.Map | null
  error: boolean
}

export function useNaverMap(ref: RefObject<HTMLDivElement>): UseNaverMapResult {
  const [map, setMap] = useState<naver.maps.Map | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!ref.current) return

    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID
    if (!clientId) {
      console.warn('VITE_NAVER_MAP_CLIENT_ID is not set')
      setError(true)
      return
    }

    if (!window.naver) {
      setError(true)
      return
    }

    try {
      const instance = new window.naver.maps.Map(ref.current, {
        center: new window.naver.maps.LatLng(37.5665, 126.978),
        zoom: 14,
      })
      setMap(instance)
    } catch (e) {
      console.error('Naver Maps init failed:', e)
      setError(true)
    }
  }, [ref])

  return { map, error }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test:run -- src/hooks/useNaverMap.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNaverMap.ts src/hooks/useNaverMap.test.ts
git commit -m "feat: add useNaverMap hook with error state"
```

---

### Task 3: BottomTabBar 컴포넌트 (TDD)

**Files:**
- Create: `src/components/BottomTabBar.tsx`
- Create: `src/components/BottomTabBar.test.tsx`

- [ ] **Step 1: 테스트 작성**

Create `src/components/BottomTabBar.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomTabBar } from './BottomTabBar'

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const renderBar = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BottomTabBar />
    </MemoryRouter>
  )

describe('BottomTabBar', () => {
  it('4개 탭 렌더링', () => {
    renderBar('/')
    expect(screen.getByText('지도')).toBeInTheDocument()
    expect(screen.getByText('그룹')).toBeInTheDocument()
    expect(screen.getByText('기록')).toBeInTheDocument()
    expect(screen.getByText('프로필')).toBeInTheDocument()
  })

  it('/ 경로에서 지도 탭이 활성', () => {
    renderBar('/')
    const 지도 = screen.getByText('지도')
    const 그룹 = screen.getByText('그룹')
    expect(지도).toHaveClass('text-white')
    expect(그룹).not.toHaveClass('text-white')
  })

  it('/group 경로에서 그룹 탭이 활성', () => {
    renderBar('/group')
    expect(screen.getByText('그룹')).toHaveClass('text-white')
    expect(screen.getByText('지도')).not.toHaveClass('text-white')
  })

  it('탭 클릭 시 해당 경로로 navigate', () => {
    renderBar('/')
    fireEvent.click(screen.getByText('그룹'))
    expect(mockNavigate).toHaveBeenCalledWith('/group')
  })

  it('/ 탭은 정확히 / 일 때만 활성 (하위 경로 제외)', () => {
    renderBar('/group')
    expect(screen.getByText('지도')).not.toHaveClass('text-white')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test:run -- src/components/BottomTabBar.test.tsx
```
Expected: FAIL — `BottomTabBar` not found.

- [ ] **Step 3: BottomTabBar 구현**

Create `src/components/BottomTabBar.tsx`:
```tsx
import { useLocation, useNavigate } from 'react-router-dom'
import { Map, Users, Clock, User } from 'lucide-react'
import type { ReactNode } from 'react'

interface Tab {
  path: string
  label: string
  icon: ReactNode
}

const TABS: Tab[] = [
  { path: '/', label: '지도', icon: <Map size={22} strokeWidth={2} /> },
  { path: '/group', label: '그룹', icon: <Users size={22} strokeWidth={2} /> },
  { path: '/history', label: '기록', icon: <Clock size={22} strokeWidth={2} /> },
  { path: '/profile', label: '프로필', icon: <User size={22} strokeWidth={2} /> },
]

function isActive(tabPath: string, currentPath: string): boolean {
  if (tabPath === '/') return currentPath === '/'
  return currentPath.startsWith(tabPath)
}

export function BottomTabBar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="bg-black border-t border-[#222] flex-shrink-0">
      <div className="flex justify-around items-center pt-2 pb-1">
        {TABS.map((tab) => {
          const active = isActive(tab.path, location.pathname)
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center gap-[3px] min-w-[52px] py-1"
              aria-label={tab.label}
            >
              <span className={active ? 'text-white' : 'text-[#555]'}>
                {tab.icon}
              </span>
              <span
                className={`text-[9px] tracking-tight ${
                  active ? 'text-white font-semibold' : 'text-[#555] font-normal'
                }`}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
      {/* iOS 홈 인디케이터 */}
      <div className="flex justify-center pb-[6px] pt-1">
        <div className="w-[100px] h-[4px] bg-white/30 rounded-full" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test:run -- src/components/BottomTabBar.test.tsx
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/BottomTabBar.tsx src/components/BottomTabBar.test.tsx
git commit -m "feat: add BottomTabBar with iOS-style black theme"
```

---

### Task 4: MainLayout (TDD)

**Files:**
- Create: `src/pages/MainLayout.tsx`
- Create: `src/pages/MainLayout.test.tsx`

- [ ] **Step 1: 테스트 작성**

Create `src/pages/MainLayout.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from './MainLayout'

vi.mock('../components/BottomTabBar', () => ({
  BottomTabBar: () => <div data-testid="bottom-tab-bar" />,
}))

describe('MainLayout', () => {
  it('BottomTabBar 렌더링', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<div>child content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('bottom-tab-bar')).toBeInTheDocument()
  })

  it('Outlet 영역에 자식 라우트 렌더링', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<div>child content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test:run -- src/pages/MainLayout.test.tsx
```
Expected: FAIL — `MainLayout` not found.

- [ ] **Step 3: MainLayout 구현**

Create `src/pages/MainLayout.tsx`:
```tsx
import { Outlet } from 'react-router-dom'
import { BottomTabBar } from '../components/BottomTabBar'

export function MainLayout() {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 relative overflow-hidden">
        <Outlet />
      </div>
      <BottomTabBar />
    </div>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test:run -- src/pages/MainLayout.test.tsx
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/MainLayout.tsx src/pages/MainLayout.test.tsx
git commit -m "feat: add MainLayout with Outlet and BottomTabBar"
```

---

## Chunk 2: 페이지 구현 + 라우팅 연결

### Task 5: MapPage (TDD)

**Files:**
- Create: `src/pages/MapPage.tsx`
- Create: `src/pages/MapPage.test.tsx`

- [ ] **Step 1: 테스트 작성**

Create `src/pages/MapPage.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MapPage } from './MapPage'

const { mockUseNaverMap } = vi.hoisted(() => ({
  mockUseNaverMap: vi.fn(),
}))

vi.mock('../hooks/useNaverMap', () => ({
  useNaverMap: mockUseNaverMap,
}))

describe('MapPage', () => {
  it('지도 초기화 중에는 아무것도 표시 안 함', () => {
    mockUseNaverMap.mockReturnValue({ map: null, error: false })
    const { container } = render(<MapPage />)
    expect(screen.queryByText(/지도를 불러올/i)).not.toBeInTheDocument()
    // 지도 div는 항상 존재
    expect(container.querySelector('[data-testid="map-container"]')).toBeInTheDocument()
  })

  it('error=true면 에러 메시지 표시', () => {
    mockUseNaverMap.mockReturnValue({ map: null, error: true })
    render(<MapPage />)
    expect(screen.getByText('지도를 불러올 수 없습니다')).toBeInTheDocument()
  })

  it('map이 있으면 에러 메시지 없음', () => {
    mockUseNaverMap.mockReturnValue({ map: {} as naver.maps.Map, error: false })
    render(<MapPage />)
    expect(screen.queryByText('지도를 불러올 수 없습니다')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test:run -- src/pages/MapPage.test.tsx
```
Expected: FAIL — `MapPage` not found.

- [ ] **Step 3: MapPage 구현**

Create `src/pages/MapPage.tsx`:
```tsx
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Crosshair } from 'lucide-react'
import { useNaverMap } from '../hooks/useNaverMap'

export function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const { map, error } = useNaverMap(mapRef)

  const handleLocate = () => {
    if (!map || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords
      map.setCenter(new window.naver.maps.LatLng(latitude, longitude))
    })
  }

  return (
    <div className="relative w-full h-full">
      {/* 네이버 지도 컨테이너 */}
      <div
        ref={mapRef}
        data-testid="map-container"
        className="absolute inset-0"
      />

      {/* 에러 오버레이 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
          <p className="text-sm text-neutral-500">지도를 불러올 수 없습니다</p>
        </div>
      )}

      {/* 내 위치 버튼 */}
      {map && (
        <div className="absolute right-3 bottom-3">
          <Button
            variant="secondary"
            size="icon"
            onClick={handleLocate}
            aria-label="내 위치"
            className="bg-white hover:bg-neutral-50 shadow-md"
          >
            <Crosshair size={18} className="text-neutral-700" />
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test:run -- src/pages/MapPage.test.tsx
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/MapPage.tsx src/pages/MapPage.test.tsx
git commit -m "feat: add MapPage with Naver Maps and location button"
```

---

### Task 6: 플레이스홀더 페이지 + ProfilePage (TDD)

**Files:**
- Create: `src/pages/GroupPage.tsx`
- Create: `src/pages/HistoryPage.tsx`
- Create: `src/pages/ProfilePage.tsx`
- Create: `src/pages/ProfilePage.test.tsx`

- [ ] **Step 1: ProfilePage 테스트 작성**

Create `src/pages/ProfilePage.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProfilePage } from './ProfilePage'

const { mockSignOut } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}))

describe('ProfilePage', () => {
  it('로그아웃 버튼 렌더링', () => {
    render(<ProfilePage />)
    expect(screen.getByRole('button', { name: /로그아웃/i })).toBeInTheDocument()
  })

  it('로그아웃 버튼 클릭 시 signOut 호출', () => {
    render(<ProfilePage />)
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test:run -- src/pages/ProfilePage.test.tsx
```
Expected: FAIL — `ProfilePage` not found.

- [ ] **Step 3: 플레이스홀더 페이지 3개 구현**

Create `src/pages/GroupPage.tsx`:
```tsx
export function GroupPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-white">
      <p className="text-lg font-semibold">그룹</p>
      <p className="text-sm text-neutral-400">준비 중</p>
    </div>
  )
}
```

Create `src/pages/HistoryPage.tsx`:
```tsx
export function HistoryPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-white">
      <p className="text-lg font-semibold">기록</p>
      <p className="text-sm text-neutral-400">준비 중</p>
    </div>
  )
}
```

Create `src/pages/ProfilePage.tsx`:
```tsx
import { Button } from '@/components/ui/button'
import { useAuth } from '../contexts/AuthContext'

export function ProfilePage() {
  const { signOut } = useAuth()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-white">
      <p className="text-lg font-semibold">프로필</p>
      <p className="text-sm text-neutral-400">준비 중</p>
      <Button variant="outline" onClick={signOut}>
        로그아웃
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: ProfilePage 테스트 통과 확인**

```bash
npm run test:run -- src/pages/ProfilePage.test.tsx
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/GroupPage.tsx src/pages/HistoryPage.tsx src/pages/ProfilePage.tsx src/pages/ProfilePage.test.tsx
git commit -m "feat: add placeholder pages and ProfilePage with sign-out"
```

---

### Task 7: App.tsx 라우팅 교체 + HomePage 삭제

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/pages/HomePage.tsx`

- [ ] **Step 1: App.tsx 교체**

Replace `src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { MainLayout } from './pages/MainLayout'
import { MapPage } from './pages/MapPage'
import { GroupPage } from './pages/GroupPage'
import { HistoryPage } from './pages/HistoryPage'
import { ProfilePage } from './pages/ProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
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
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: HomePage.tsx 삭제**

```bash
rm src/pages/HomePage.tsx
```

- [ ] **Step 3: 전체 테스트 실행**

```bash
npm run test:run
```
Expected: All tests PASS (기존 15개 + 신규 16개 = 31개).

- [ ] **Step 4: 빌드 확인**

```bash
npm run build
```
Expected: 빌드 성공.

- [ ] **Step 5: 개발 서버 확인**

```bash
npm run dev
```
http://localhost:5173 접속:
- 로그인 안 된 상태 → `/login` 리다이렉트
- 로그인 후 → 전체화면 배경 + 하단 솔리드 블랙 탭바 (지도·그룹·기록·프로필)
- 각 탭 클릭 시 플레이스홀더 페이지 전환

Stop with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git rm src/pages/HomePage.tsx
git commit -m "feat: wire main screen routing with nested routes"
```

---

## Naver Maps 실제 연동 참고

`VITE_NAVER_MAP_CLIENT_ID`에 실제 키를 넣으려면:
1. [ncloud.naver.com](https://ncloud.naver.com) → AI·NAVER API → Maps → Web Dynamic Map
2. 애플리케이션 등록 → Client ID 발급
3. 허용 도메인에 `localhost` 추가 (개발) / 실 도메인 추가 (운영)
4. `.env.local`에 Client ID 입력
