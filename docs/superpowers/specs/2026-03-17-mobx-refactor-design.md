# Trail — MobX 리팩토링 디자인 스펙

## 개요

뷰 컴포넌트에 흩어진 비즈니스 로직을 MobX 클래스 스토어로 이동한다. 컴포넌트는 렌더링과 이벤트 바인딩만 담당하고, 상태와 로직은 스토어가 소유한다.

## 기술 스택

- **상태 관리:** MobX 6, `makeAutoObservable`
- **React 연동:** `mobx-react-lite` (`observer`, `useLocalObservable` 불사용 — `useState`로 인스턴스 생성)
- **스타일:** TypeScript strict, 모든 statement에 `;`, 접근자(`public`/`private`) 명시

## 스토어 설계 원칙

- `makeAutoObservable(this)` — 데코레이터 없이, 생성자에서 자동으로 observable/action/computed 추론
- 싱글턴 export 없음 — 각 컴포넌트에서 `useState(() => new XxxStore())` 로 인스턴스 생성
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
└── pages/
    ├── LoginPage.tsx        # 수정 — AuthStore 사용
    ├── AuthCallbackPage.tsx # 수정 — AuthStore 사용
    ├── ProfilePage.tsx      # 수정 — AuthStore 사용
    └── MapPage.tsx          # 수정 — MapStore 사용
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
  public exchanged: boolean = false;

  public constructor() {
    makeAutoObservable(this);
  }

  // getSession()으로 초기 세션 로드 + onAuthStateChange 구독
  // 반환값: unsubscribe 함수 (useEffect cleanup에 사용)
  public initialize(): () => void { ... }

  public async signOut(): Promise<void> { ... }

  // PKCE OAuth code 교환. 성공 시 exchanged = true, 실패 시 navigate to /login
  public async exchangeCode(code: string): Promise<void> { ... }
}

export { AuthStore };
```

**상태 설명:**
| 상태 | 타입 | 설명 |
|------|------|------|
| `user` | `User \| null` | 현재 로그인 유저. null = 미로그인 |
| `loading` | `boolean` | 초기 세션 확인 중 여부 |
| `exchanged` | `boolean` | OAuth code 교환 성공 여부 (AuthCallbackPage용) |

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

  // DOM 엘리먼트 전달받아 naver.maps.Map 초기화
  // env var 미설정 또는 window.naver 없으면 error = true
  public initMap(el: HTMLDivElement): void { ... }

  // navigator.geolocation으로 현재 위치로 지도 이동
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
  // ...
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

- `AuthStore` 인스턴스 생성
- `store.exchangeCode(code)` 호출 (StrictMode 중복 방지 로직도 스토어로 이동)
- `store.exchanged && store.user` 조건으로 navigate

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

- 스토어 단위 테스트: 각 스토어 메서드를 직접 테스트 (Supabase/naver mock)
- 컴포넌트 테스트: 스토어 인스턴스를 `useState` mock으로 교체
- 기존 컴포넌트 테스트 파일 업데이트 (AuthContext mock → AuthStore mock)

## 범위 외

- BottomTabBar, MainLayout, GroupPage, HistoryPage — 로직 없음, 변경 없음
- LoginPage의 `signInWithOAuth` 호출 — 스토어로 이동하지 않음 (단순 API call)
