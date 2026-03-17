# Trail — MobX 리팩토링 디자인 스펙

## 개요

뷰 컴포넌트에 흩어진 비즈니스 로직을 MobX 클래스 스토어로 이동한다. 컴포넌트는 렌더링과 이벤트 바인딩만 담당하고, 상태와 로직은 스토어가 소유한다.

## 기술 스택

- **상태 관리:** MobX 6, `makeAutoObservable`
- **React 연동:** `mobx-react-lite` (`observer`)
- **스타일:** TypeScript strict, 모든 statement에 `;`, 접근자(`public`/`private`) 명시

## 스토어 설계 원칙

- `makeAutoObservable(this)` — 데코레이터 없이, 생성자에서 자동으로 observable/action/computed 추론
- 싱글턴 export 없음 — 각 컴포넌트에서 `useState(() => new XxxStore())` 로 인스턴스 생성
  - `AuthStore`를 여러 컴포넌트가 각자 생성해도 Supabase `onAuthStateChange` 이벤트를 통해 동일한 세션 상태를 공유함 (예: `ProfilePage`에서 `signOut()` 호출 시 `ProtectedRoute`의 스토어도 `SIGNED_OUT` 이벤트를 받아 갱신됨)
- 스토어 파일은 클래스만 export
- 접근자 명시: 외부에서 읽는 state/메서드는 `public`, 내부 전용은 `private`
- 모든 statement에 `;`

## 파일 구조

```
src/
├── stores/
│   ├── AuthStore.ts        # 신규
│   └── MapStore.ts         # 신규
├── contexts/
│   └── AuthContext.tsx     # 삭제
├── hooks/
│   └── useNaverMap.ts      # 삭제
├── components/
│   ├── ProtectedRoute.tsx  # 수정 — AuthStore 사용
│   └── BottomTabBar.tsx    # 변경 없음 (로직 없음)
├── pages/
│   ├── LoginPage.tsx        # 수정 — AuthStore 사용
│   ├── AuthCallbackPage.tsx # 수정 — AuthStore 사용
│   ├── ProfilePage.tsx      # 수정 — AuthStore 사용
│   └── MapPage.tsx          # 수정 — MapStore 사용
└── App.tsx                  # 수정 — AuthProvider import/래퍼 제거
```

## 스토어 명세

### AuthStore

**파일:** `src/stores/AuthStore.ts`

**역할:** 인증 상태 관리, Supabase auth 구독, OAuth code 교환

```ts
import { makeAutoObservable } from 'mobx';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

class AuthStore {
  public user: User | null = null;
  public loading: boolean = true;

  public constructor() {
    makeAutoObservable(this);
  }

  // 동기적으로 호출됨. 내부에서 비동기 작업 시작 후 cleanup 함수 즉시 반환.
  // getSession()으로 초기 세션 로드 후 loading = false.
  // onAuthStateChange 구독으로 이후 변경 감지.
  // useEffect cleanup에서 호출할 unsubscribe 함수 반환.
  public initialize(): () => void { ... }

  public async signOut(): Promise<void> { ... }

  // PKCE OAuth code 교환. StrictMode 이중 호출 방지 포함.
  // 성공 시 true, 실패 시 false 반환.
  public async exchangeCode(code: string): Promise<boolean> { ... }
}

export { AuthStore };
```

**상태 설명:**
| 상태 | 타입 | 설명 |
|------|------|------|
| `user` | `User \| null` | 현재 로그인 유저. null = 미로그인 |
| `loading` | `boolean` | 초기 세션 확인 중 여부. `getSession()` resolve 후 `false` |

**설계 결정:** `exchanged` 플래그는 `AuthCallbackPage` 전용 뷰 로직이므로 스토어에 두지 않는다. `exchangeCode`가 `Promise<boolean>`을 반환하고, 컴포넌트가 로컬 `useState`로 결과를 관리한다.

### MapStore

**파일:** `src/stores/MapStore.ts`

**역할:** 네이버 지도 초기화, 내 위치 이동

```ts
import { makeAutoObservable } from 'mobx';

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;

  public constructor() {
    makeAutoObservable(this);
  }

  // DOM 엘리먼트 전달받아 naver.maps.Map 초기화.
  // env var 미설정 또는 window.naver 없으면 error = true.
  public initMap(el: HTMLDivElement): void { ... }

  // navigator.geolocation이 없거나 map이 null이면 아무것도 하지 않음.
  // getCurrentPosition 실패(권한 거부 등)는 무시 (기존 동작 유지).
  public locate(): void { ... }
}

export { MapStore };
```

## 컴포넌트 변경 명세

### 공통 패턴

```tsx
import { observer } from 'mobx-react-lite';
import { useState, useEffect } from 'react';
import { AuthStore } from '../stores/AuthStore';

const MyComponent = observer(() => {
  const [store] = useState(() => new AuthStore());
  useEffect(() => store.initialize(), [store]);
  // store.user, store.loading 으로 렌더링 분기
});
```

### ProtectedRoute

- `AuthStore` 인스턴스 생성 + `initialize()`
- `store.loading` / `store.user` 로 렌더링 분기 (기존 로직과 동일)

### LoginPage

- `AuthStore` 인스턴스 생성 + `initialize()`
- `store.user` 있으면 `/` 로 redirect
- `supabase.auth.signInWithOAuth` 는 컴포넌트에 유지 (단순 Supabase API 호출, 별도 로직 없음)

### AuthCallbackPage

- `AuthStore` 인스턴스 생성 (initialize 불필요 — code 교환만)
- 로컬 `useState`로 `exchanged: boolean` 관리
- `store.exchangeCode(code)` 호출 → 반환값으로 `setExchanged(true/false)`
- `exchanged && store.user` 조건으로 navigate
- StrictMode 이중 호출 방지 (`useRef`)는 스토어 내부에서 처리

### ProfilePage

- `AuthStore` 인스턴스 생성 + `initialize()`
- `store.signOut()` 호출

### MapPage

- `MapStore` 인스턴스 생성
- `useRef`로 DOM ref 유지, `useEffect`에서 `store.initMap(ref.current)` 호출
- `store.map`, `store.error` 로 렌더링 분기
- `store.locate()` 호출

## 삭제 대상

| 파일 | 이유 |
|------|------|
| `src/contexts/AuthContext.tsx` | AuthStore로 대체 |
| `src/hooks/useNaverMap.ts` | MapStore로 대체 |

## 테스트 전략

**스토어 단위 테스트:** 각 스토어 메서드를 직접 호출해 상태 변화 검증. Supabase와 `window.naver`는 vi.mock으로 모킹.

**컴포넌트 테스트:** `vi.mock`으로 스토어 모듈의 클래스 생성자를 교체해 mock 인스턴스 주입.

```ts
// 예시
vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn().mockImplementation(() => ({
    user: null,
    loading: false,
    initialize: vi.fn(() => () => {}),
    signOut: vi.fn(),
  })),
}));
```

기존 `AuthContext` mock → `AuthStore` mock으로 교체. MobX observable 상태 변경이 포함된 테스트는 `act()` 래핑 필요.

## 범위 외

- BottomTabBar, MainLayout, GroupPage, HistoryPage — 로직 없음, 변경 없음
- LoginPage의 `signInWithOAuth` 호출 — 스토어로 이동하지 않음 (단순 API call)
