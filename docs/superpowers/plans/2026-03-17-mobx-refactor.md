# MobX Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all business logic from React components into MobX class stores (`AuthStore`, `MapStore`), making components pure renderers.

**Architecture:** Two stores replace `AuthContext` and `useNaverMap`. Each component creates its own store instance via `useState(() => new XxxStore())`. Auth state syncs across independent instances via Supabase `onAuthStateChange` events.

**Tech Stack:** MobX 6 (`makeAutoObservable`, `runInAction`), mobx-react-lite (`observer`), Vitest, React Testing Library

---

## Chunk 1: Install MobX + Store TDD

### Task 1: Install MobX packages

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install MobX**

```bash
npm install mobx mobx-react-lite
```

Expected: `package.json` updated with `mobx` and `mobx-react-lite` in dependencies.

- [ ] **Step 2: Run existing tests to confirm nothing broke**

```bash
npm run test:run
```

Expected: All tests pass (green). If any fail, investigate before proceeding.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install mobx and mobx-react-lite"
```

---

### Task 2: AuthStore (TDD)

**Files:**
- Create: `src/stores/AuthStore.ts`
- Create: `src/stores/AuthStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/stores/AuthStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthStore } from './AuthStore';

const { mockGetSession, mockOnAuthStateChange, mockSignOut, mockExchangeCodeForSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockSignOut: vi.fn(),
  mockExchangeCodeForSession: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: unknown) => mockOnAuthStateChange(cb),
      signOut: () => mockSignOut(),
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
    },
  },
}));

const mockUnsubscribe = vi.fn();

describe('AuthStore', () => {
  let store: AuthStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    store = new AuthStore();
  });

  describe('initial state', () => {
    it('user is null initially', () => {
      expect(store.user).toBeNull();
    });

    it('loading is true initially', () => {
      expect(store.loading).toBe(true);
    });
  });

  describe('initialize()', () => {
    it('sets user from session after getSession resolves', async () => {
      const fakeUser = { id: 'user-1' };
      mockGetSession.mockResolvedValue({ data: { session: { user: fakeUser } } });
      store.initialize();
      await vi.waitFor(() => expect(store.user).toEqual(fakeUser));
    });

    it('sets loading=false after getSession resolves', async () => {
      store.initialize();
      await vi.waitFor(() => expect(store.loading).toBe(false));
    });

    it('sets user=null when no session', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      store.initialize();
      await vi.waitFor(() => expect(store.loading).toBe(false));
      expect(store.user).toBeNull();
    });

    it('subscribes to onAuthStateChange', () => {
      store.initialize();
      expect(mockOnAuthStateChange).toHaveBeenCalledOnce();
    });

    it('updates user when auth state changes', async () => {
      const fakeUser = { id: 'user-2' };
      let capturedCb: ((event: string, session: unknown) => void) | null = null;
      mockOnAuthStateChange.mockImplementation((cb) => {
        capturedCb = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      });
      store.initialize();
      capturedCb!('SIGNED_IN', { user: fakeUser });
      expect(store.user).toEqual(fakeUser);
    });

    it('returns unsubscribe function', () => {
      const cleanup = store.initialize();
      cleanup();
      expect(mockUnsubscribe).toHaveBeenCalledOnce();
    });
  });

  describe('signOut()', () => {
    it('calls supabase.auth.signOut', async () => {
      mockSignOut.mockResolvedValue({});
      await store.signOut();
      expect(mockSignOut).toHaveBeenCalledOnce();
    });
  });

  describe('exchangeCode()', () => {
    it('returns true on success', async () => {
      const fakeUser = { id: 'user-3' };
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: { user: fakeUser } }, error: null });
      const result = await store.exchangeCode('valid-code');
      expect(result).toBe(true);
    });

    it('sets user on success', async () => {
      const fakeUser = { id: 'user-3' };
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: { user: fakeUser } }, error: null });
      await store.exchangeCode('valid-code');
      expect(store.user).toEqual(fakeUser);
    });

    it('returns false on error', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: 'invalid' } });
      const result = await store.exchangeCode('bad-code');
      expect(result).toBe(false);
    });

    it('returns false when no error but session is null', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });
      const result = await store.exchangeCode('code');
      expect(result).toBe(false);
    });

    it('does not call exchangeCodeForSession a second time (StrictMode guard)', async () => {
      const fakeUser = { id: 'user-3' };
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: { user: fakeUser } }, error: null });
      await store.exchangeCode('code');
      await store.exchangeCode('code');
      expect(mockExchangeCodeForSession).toHaveBeenCalledOnce();
    });

    it('second call returns false immediately without calling supabase', async () => {
      const fakeUser = { id: 'user-3' };
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: { user: fakeUser } }, error: null });
      await store.exchangeCode('code');
      const result = await store.exchangeCode('code');
      expect(result).toBe(false);
      expect(mockExchangeCodeForSession).toHaveBeenCalledOnce();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/stores/AuthStore.test.ts
```

Expected: FAIL — "Cannot find module './AuthStore'"

- [ ] **Step 3: Implement AuthStore**

Create `src/stores/AuthStore.ts`:

```ts
import { makeAutoObservable, runInAction } from 'mobx';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

class AuthStore {
  public user: User | null = null;
  public loading: boolean = true;
  private _exchangeAttempted: boolean = false;

  public constructor() {
    makeAutoObservable(this);
  }

  public initialize(): () => void {
    supabase.auth.getSession().then(({ data: { session } }) => {
      runInAction(() => {
        this.user = session?.user ?? null;
        this.loading = false;
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      runInAction(() => {
        this.user = session?.user ?? null;
      });
    });

    return () => subscription.unsubscribe();
  }

  public async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  public async exchangeCode(code: string): Promise<boolean> {
    if (this._exchangeAttempted) {
      return false;
    }
    this._exchangeAttempted = true;
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      runInAction(() => {
        this.user = data.session!.user;
      });
      return true;
    }
    return false;
  }
}

export { AuthStore };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/stores/AuthStore.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/stores/AuthStore.ts src/stores/AuthStore.test.ts
git commit -m "feat: add AuthStore with MobX"
```

---

### Task 3: MapStore (TDD)

**Files:**
- Create: `src/stores/MapStore.ts`
- Create: `src/stores/MapStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/stores/MapStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapStore } from './MapStore';

const mockMap = { setCenter: vi.fn() };
const mockNaverMaps = {
  Map: vi.fn(function () { return mockMap; }),
  LatLng: vi.fn(function (lat: number, lng: number) { return { lat, lng }; }),
};

describe('MapStore', () => {
  let store: MapStore;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_NAVER_MAP_CLIENT_ID', 'test-key');
    store = new MapStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as unknown as Record<string, unknown>).naver;
  });

  describe('initial state', () => {
    it('map is null initially', () => {
      expect(store.map).toBeNull();
    });

    it('error is false initially', () => {
      expect(store.error).toBe(false);
    });
  });

  describe('initMap()', () => {
    it('sets map on success', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      expect(store.map).toBe(mockMap);
      expect(store.error).toBe(false);
    });

    it('sets error=true when window.naver is missing', () => {
      delete (window as unknown as Record<string, unknown>).naver;
      const div = document.createElement('div');
      store.initMap(div);
      expect(store.map).toBeNull();
      expect(store.error).toBe(true);
    });

    it('sets error=true when VITE_NAVER_MAP_CLIENT_ID is not set', () => {
      vi.stubEnv('VITE_NAVER_MAP_CLIENT_ID', '');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      expect(store.error).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith('VITE_NAVER_MAP_CLIENT_ID is not set');
      warnSpy.mockRestore();
    });

    it('sets error=true when Map constructor throws', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockNaverMaps.Map.mockImplementation(function () { throw new Error('init fail'); });
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      expect(store.map).toBeNull();
      expect(store.error).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('passes correct center coordinates', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      expect(mockNaverMaps.LatLng).toHaveBeenCalledWith(37.5665, 126.978);
    });
  });

  describe('locate()', () => {
    it('does nothing when map is null', () => {
      const getSpy = vi.spyOn(navigator.geolocation, 'getCurrentPosition');
      store.locate();
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('does nothing when navigator.geolocation is absent', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      const originalGeolocation = navigator.geolocation;
      Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
      store.locate();
      // no error thrown — method exits silently
      Object.defineProperty(navigator, 'geolocation', { value: originalGeolocation, configurable: true });
    });

    it('calls getCurrentPosition when map is set', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      const getSpy = vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation(() => {});
      store.locate();
      expect(getSpy).toHaveBeenCalledOnce();
    });

    it('calls map.setCenter with current position', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation((cb) => {
        cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
      });
      store.locate();
      expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 37.1, lng: 127.1 });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/stores/MapStore.test.ts
```

Expected: FAIL — "Cannot find module './MapStore'"

- [ ] **Step 3: Implement MapStore**

Create `src/stores/MapStore.ts`:

```ts
import { makeAutoObservable } from 'mobx';

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;

  public constructor() {
    makeAutoObservable(this);
  }

  public initMap(el: HTMLDivElement): void {
    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
    if (!clientId) {
      console.warn('VITE_NAVER_MAP_CLIENT_ID is not set');
      this.error = true;
      return;
    }

    if (!window.naver) {
      this.error = true;
      return;
    }

    try {
      const instance = new window.naver.maps.Map(el, {
        center: new window.naver.maps.LatLng(37.5665, 126.978),
        zoom: 14,
      });
      this.map = instance;
    } catch (e) {
      console.error('Naver Maps init failed:', e);
      this.error = true;
    }
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/stores/MapStore.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/stores/MapStore.ts src/stores/MapStore.test.ts
git commit -m "feat: add MapStore with MobX"
```

---

## Chunk 2: Component Refactors + Cleanup

### Task 4: Refactor ProtectedRoute

**Files:**
- Modify: `src/components/ProtectedRoute.tsx`
- Modify: `src/components/ProtectedRoute.test.tsx`

- [ ] **Step 1: Update ProtectedRoute.test.tsx**

Replace the entire file:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    user: null as { email: string } | null,
    loading: true,
    initialize: vi.fn(() => () => {}),
  },
}));

vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn(() => mockStore),
}));

const renderWithRouter = (initialPath = '/') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe('ProtectedRoute', () => {
  it('shows spinner while loading', () => {
    mockStore.user = null;
    mockStore.loading = true;
    renderWithRouter();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login when no user', () => {
    mockStore.user = null;
    mockStore.loading = false;
    renderWithRouter();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    mockStore.user = { email: 'test@example.com' };
    mockStore.loading = false;
    renderWithRouter();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run updated tests to verify they fail**

```bash
npm run test:run -- src/components/ProtectedRoute.test.tsx
```

Expected: FAIL — component still imports from `AuthContext`.

- [ ] **Step 3: Update ProtectedRoute.tsx**

Replace the entire file:

```tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { useState, useEffect } from 'react';
import { AuthStore } from '../stores/AuthStore';

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute = observer(({ children }: ProtectedRouteProps) => {
  const [store] = useState(() => new AuthStore());
  const location = useLocation();

  useEffect(() => store.initialize(), [store]);

  if (store.loading) {
    return (
      <div
        role="status"
        className="flex h-screen items-center justify-center"
        aria-label="로딩 중"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-transparent" />
      </div>
    );
  }

  if (!store.user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/components/ProtectedRoute.test.tsx
```

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProtectedRoute.tsx src/components/ProtectedRoute.test.tsx
git commit -m "refactor: migrate ProtectedRoute to AuthStore"
```

---

### Task 5: Refactor LoginPage

**Files:**
- Modify: `src/pages/LoginPage.tsx`
- Modify: `src/pages/LoginPage.test.tsx`

- [ ] **Step 1: Update LoginPage.test.tsx**

Replace the entire file:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const { mockStore, mockSignInWithOAuth } = vi.hoisted(() => ({
  mockStore: {
    user: null as { email: string } | null,
    loading: false,
    initialize: vi.fn(() => () => {}),
  },
  mockSignInWithOAuth: vi.fn(),
}));

vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn(() => mockStore),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: () => mockSignInWithOAuth(),
    },
  },
}));

const renderLoginPage = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.user = null;
    mockStore.loading = false;
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  it('renders Google and Kakao login buttons', () => {
    renderLoginPage();
    expect(screen.getByRole('button', { name: /구글/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /카카오/i })).toBeInTheDocument();
  });

  it('redirects to / when user is already logged in', () => {
    mockStore.user = { email: 'test@example.com' };
    renderLoginPage();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('disables both buttons while Google login is in progress', async () => {
    mockSignInWithOAuth.mockImplementation(() => new Promise(() => {}));
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /구글/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /카카오/i })).toBeDisabled();
    });
  });

  it('disables both buttons while Kakao login is in progress', async () => {
    mockSignInWithOAuth.mockImplementation(() => new Promise(() => {}));
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /카카오/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /구글/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /카카오/i })).toBeDisabled();
    });
  });
});
```

- [ ] **Step 2: Run updated tests to verify they fail**

```bash
npm run test:run -- src/pages/LoginPage.test.tsx
```

Expected: FAIL — component still imports from `AuthContext`.

- [ ] **Step 3: Update LoginPage.tsx**

Replace the entire file:

```tsx
import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '../lib/supabase';
import { AuthStore } from '../stores/AuthStore';

type Provider = 'google' | 'kakao';

export const LoginPage = observer(() => {
  const [store] = useState(() => new AuthStore());
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

  useEffect(() => store.initialize(), [store]);

  if (!store.loading && store.user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (provider: Provider) => {
    setLoadingProvider(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch {
      toast.error('잠시 후 다시 시도해주세요');
      setLoadingProvider(null);
    }
  };

  const isLoading = loadingProvider !== null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <Card className="w-full max-w-sm border-neutral-200 shadow-none">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl font-bold tracking-tight">Trail</CardTitle>
          <CardDescription className="text-neutral-500">등산 위치 공유 서비스</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          <Button
            variant="outline"
            className="w-full gap-2 border-neutral-300 bg-white text-black hover:bg-neutral-50"
            onClick={() => handleLogin('google')}
            disabled={isLoading}
            aria-label="구글로 로그인"
          >
            {loadingProvider === 'google' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            구글로 시작하기
          </Button>
          <Button
            className="w-full gap-2 bg-[#FEE500] text-black hover:bg-[#F5DC00] border-0"
            onClick={() => handleLogin('kakao')}
            disabled={isLoading}
            aria-label="카카오로 로그인"
          >
            {loadingProvider === 'kakao' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KakaoIcon />
            )}
            카카오로 시작하기
          </Button>
        </CardContent>
      </Card>
    </div>
  );
});

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="#000000">
      <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.636 1.607 4.953 4.03 6.327L5.1 20.1a.375.375 0 0 0 .54.415L10.1 17.9A11.6 11.6 0 0 0 12 18c5.523 0 10-3.477 10-7.5S17.523 3 12 3z" />
    </svg>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/pages/LoginPage.test.tsx
```

Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LoginPage.tsx src/pages/LoginPage.test.tsx
git commit -m "refactor: migrate LoginPage to AuthStore"
```

---

### Task 6: Refactor AuthCallbackPage

**Files:**
- Modify: `src/pages/AuthCallbackPage.tsx`
- Modify: `src/pages/AuthCallbackPage.test.tsx`

- [ ] **Step 1: Update AuthCallbackPage.test.tsx**

Replace the entire file:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { AuthCallbackPage } from './AuthCallbackPage';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    user: null as User | null,
    exchangeCode: vi.fn(),
  },
}));

vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn(() => mockStore),
}));

const renderCallback = (search = '?code=test-code') =>
  render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<div>Home</div>} />
        <Route path="/login" element={<div>Login</div>} />
        <Route path="/map" element={<div>Map Page</div>} />
      </Routes>
    </MemoryRouter>
  );

const fakeUser = { id: 'user-1' } as User;

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.user = null;
  });

  it('shows loading spinner initially', () => {
    mockStore.exchangeCode.mockImplementation(() => new Promise(() => {}));
    renderCallback();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('redirects to / once exchange succeeds and user is set', async () => {
    mockStore.exchangeCode.mockResolvedValue(true);
    mockStore.user = fakeUser;
    renderCallback();
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
  });

  it('redirects to /login on error', async () => {
    mockStore.exchangeCode.mockResolvedValue(false);
    renderCallback();
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });

  it('redirects to next param path on success', async () => {
    mockStore.exchangeCode.mockResolvedValue(true);
    mockStore.user = fakeUser;
    renderCallback('?code=abc&next=%2Fmap');
    await waitFor(() => {
      expect(screen.getByText('Map Page')).toBeInTheDocument();
    });
  });

  it('redirects to /login when no code param', async () => {
    renderCallback('');
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run updated tests to verify they fail**

```bash
npm run test:run -- src/pages/AuthCallbackPage.test.tsx
```

Expected: FAIL — component still imports from `AuthContext`.

- [ ] **Step 3: Update AuthCallbackPage.tsx**

Replace the entire file:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { AuthStore } from '../stores/AuthStore';

export const AuthCallbackPage = observer(() => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [store] = useState(() => new AuthStore());
  const [exchanged, setExchanged] = useState(false);
  const next = searchParams.get('next') ?? '/';

  // Step 1: exchange the code (once — guard inside AuthStore prevents double-invoke)
  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      navigate('/login', { replace: true });
      return;
    }
    store.exchangeCode(code).then((success) => {
      if (success) {
        setExchanged(true);
      } else {
        navigate('/login', { replace: true });
      }
    });
  }, [navigate, searchParams, store]);

  // Step 2: navigate only after user is confirmed in store
  useEffect(() => {
    if (exchanged && store.user) {
      navigate(next, { replace: true });
    }
  }, [exchanged, store.user, navigate, next]);

  return (
    <div
      role="status"
      className="flex h-screen items-center justify-center"
      aria-label="로그인 처리 중"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-transparent" />
    </div>
  );
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/pages/AuthCallbackPage.test.tsx
```

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AuthCallbackPage.tsx src/pages/AuthCallbackPage.test.tsx
git commit -m "refactor: migrate AuthCallbackPage to AuthStore"
```

---

### Task 7: Refactor ProfilePage

**Files:**
- Modify: `src/pages/ProfilePage.tsx`
- Modify: `src/pages/ProfilePage.test.tsx`

- [ ] **Step 1: Update ProfilePage.test.tsx**

Replace the entire file:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    user: null,
    loading: false,
    initialize: vi.fn(() => () => {}),
    signOut: vi.fn(),
  },
}));

vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn(() => mockStore),
}));

describe('ProfilePage', () => {
  it('로그아웃 버튼 렌더링', () => {
    render(<ProfilePage />);
    expect(screen.getByRole('button', { name: /로그아웃/i })).toBeInTheDocument();
  });

  it('로그아웃 버튼 클릭 시 signOut 호출', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/i }));
    expect(mockStore.signOut).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run updated tests to verify they fail**

```bash
npm run test:run -- src/pages/ProfilePage.test.tsx
```

Expected: FAIL — component still imports from `AuthContext`.

- [ ] **Step 3: Update ProfilePage.tsx**

Replace the entire file:

```tsx
import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { AuthStore } from '../stores/AuthStore';

export const ProfilePage = observer(() => {
  const [store] = useState(() => new AuthStore());

  useEffect(() => store.initialize(), [store]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-white">
      <p className="text-lg font-semibold">프로필</p>
      <p className="text-sm text-neutral-400">준비 중</p>
      <Button variant="outline" onClick={() => store.signOut()}>
        로그아웃
      </Button>
    </div>
  );
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/pages/ProfilePage.test.tsx
```

Expected: Both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProfilePage.tsx src/pages/ProfilePage.test.tsx
git commit -m "refactor: migrate ProfilePage to AuthStore"
```

---

### Task 8: Refactor MapPage

**Files:**
- Modify: `src/pages/MapPage.tsx`
- Modify: `src/pages/MapPage.test.tsx`

- [ ] **Step 1: Update MapPage.test.tsx**

Replace the entire file:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapPage } from './MapPage';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    map: null as naver.maps.Map | null,
    error: false,
    initMap: vi.fn(),
    locate: vi.fn(),
  },
}));

vi.mock('../stores/MapStore', () => ({
  MapStore: vi.fn(() => mockStore),
}));

describe('MapPage', () => {
  it('지도 초기화 중에는 아무것도 표시 안 함', () => {
    mockStore.map = null;
    mockStore.error = false;
    const { container } = render(<MapPage />);
    expect(screen.queryByText(/지도를 불러올/i)).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="map-container"]')).toBeInTheDocument();
  });

  it('error=true면 에러 메시지 표시', () => {
    mockStore.map = null;
    mockStore.error = true;
    render(<MapPage />);
    expect(screen.getByText('지도를 불러올 수 없습니다')).toBeInTheDocument();
  });

  it('map이 있으면 에러 메시지 없음', () => {
    mockStore.map = {} as naver.maps.Map;
    mockStore.error = false;
    render(<MapPage />);
    expect(screen.queryByText('지도를 불러올 수 없습니다')).not.toBeInTheDocument();
  });

  it('map이 있으면 내 위치 버튼 표시', () => {
    mockStore.map = {} as naver.maps.Map;
    mockStore.error = false;
    render(<MapPage />);
    expect(screen.getByRole('button', { name: '내 위치' })).toBeInTheDocument();
  });

  it('map이 null이면 내 위치 버튼 없음', () => {
    mockStore.map = null;
    mockStore.error = false;
    render(<MapPage />);
    expect(screen.queryByRole('button', { name: '내 위치' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run updated tests to verify they fail**

```bash
npm run test:run -- src/pages/MapPage.test.tsx
```

Expected: FAIL — component still imports from `useNaverMap`.

- [ ] **Step 3: Update MapPage.tsx**

Replace the entire file:

```tsx
import { useRef, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Crosshair } from 'lucide-react';
import { MapStore } from '../stores/MapStore';

export const MapPage = observer(() => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [store] = useState(() => new MapStore());

  useEffect(() => {
    if (mapRef.current) {
      store.initMap(mapRef.current);
    }
  }, [store]);

  return (
    <div className="relative w-full h-full">
      {/* 네이버 지도 컨테이너 */}
      <div
        ref={mapRef}
        data-testid="map-container"
        className="absolute inset-0"
      />

      {/* 에러 오버레이 */}
      {store.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
          <p className="text-sm text-neutral-500">지도를 불러올 수 없습니다</p>
        </div>
      )}

      {/* 내 위치 버튼 */}
      {store.map && (
        <div className="absolute right-3 bottom-3">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => store.locate()}
            aria-label="내 위치"
            className="bg-white hover:bg-neutral-50 shadow-md"
          >
            <Crosshair size={18} className="text-neutral-700" />
          </Button>
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/pages/MapPage.test.tsx
```

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MapPage.tsx src/pages/MapPage.test.tsx
git commit -m "refactor: migrate MapPage to MapStore"
```

---

### Task 9: Cleanup — remove AuthContext, useNaverMap, update App.tsx

**Files:**
- Delete: `src/contexts/AuthContext.tsx`
- Delete: `src/contexts/AuthContext.test.tsx`
- Delete: `src/hooks/useNaverMap.ts`
- Delete: `src/hooks/useNaverMap.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update App.tsx**

Replace the entire file:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { MainLayout } from './pages/MainLayout';
import { MapPage } from './pages/MapPage';
import { GroupPage } from './pages/GroupPage';
import { HistoryPage } from './pages/HistoryPage';
import { ProfilePage } from './pages/ProfilePage';

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Delete old files**

```bash
rm src/contexts/AuthContext.tsx
rm src/contexts/AuthContext.test.tsx
rm src/hooks/useNaverMap.ts
rm src/hooks/useNaverMap.test.ts
```

- [ ] **Step 3: Run full test suite**

```bash
npm run test:run
```

Expected: All tests pass. No references to deleted files.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove AuthContext and useNaverMap, update App.tsx"
```
