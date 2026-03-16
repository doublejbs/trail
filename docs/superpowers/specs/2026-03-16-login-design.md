# Trail — 로그인 기능 디자인 스펙

## 개요

Trail은 등산 중 그룹 멤버 간 실시간 위치를 공유하는 지도 기반 모바일 웹 서비스다. 이 문서는 초기 로그인 기능의 설계를 정의한다.

## 기술 스택

- **Frontend:** Vite + React (SPA)
- **라우팅:** React Router v6
- **Auth Backend:** Supabase Auth (JS SDK v2)
- **UI:** shadcn/ui (neutral 팔레트, 화이트/블랙 테마)
- **OAuth Providers:** Google (네이티브), Kakao (Custom OAuth Provider)

## 환경 변수

```env
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

## 아키텍처

### 파일 구조

```
src/
├── lib/
│   └── supabase.ts           # Supabase 클라이언트 초기화
├── contexts/
│   └── AuthContext.tsx        # 전역 인증 상태 관리
├── components/
│   └── ProtectedRoute.tsx    # 인증 가드 컴포넌트
├── pages/
│   ├── LoginPage.tsx         # 로그인 화면
│   └── AuthCallbackPage.tsx  # OAuth 콜백 처리
└── App.tsx                   # React Router 라우팅 설정
```

### 라우팅 구조

```
/              → ProtectedRoute → HomePage
/login         → LoginPage (로그인 완료 시 / 또는 원래 경로로 리다이렉트)
/auth/callback → AuthCallbackPage (OAuth PKCE 코드 교환)
```

### 인증 플로우 (PKCE)

Supabase JS v2는 OAuth에 PKCE(Proof Key for Code Exchange) 플로우를 사용한다.

1. 비인증 유저가 보호된 경로 접근 → `next` 파라미터와 함께 `/login?next=/원래경로`로 리다이렉트
2. 구글 또는 카카오 버튼 클릭 → `supabase.auth.signInWithOAuth({ redirectTo: .../auth/callback })` 호출 (full-page redirect, 팝업 아님)
3. OAuth 제공자 인증 완료 후 `/auth/callback?code=...`으로 리다이렉트
4. `AuthCallbackPage`에서 `supabase.auth.exchangeCodeForSession()` 호출
5. 세션을 `localStorage`에 저장
6. `next` 파라미터가 있으면 해당 경로로, 없으면 `/`로 리다이렉트

## 컴포넌트 설계

### AuthContext

```ts
interface AuthContextType {
  user: User | null       // Supabase User, null이면 비로그인
  loading: boolean        // 초기 세션 확인 중 (앱 마운트 시 1회)
  signOut: () => Promise<void>
}
```

- `supabase.auth.getSession()`으로 초기 세션 로드
- `supabase.auth.onAuthStateChange()`로 세션 변경 구독
  - 다른 탭에서 로그아웃 시 자동 반영
  - 토큰 만료 시 Supabase SDK가 자동으로 refresh token으로 갱신 시도
  - Refresh token도 만료(장기 미사용 등)된 경우 → `user`가 `null`이 되어 로그인 화면으로 이동
- 앱 최상단에서 모든 자식 컴포넌트에 인증 상태 제공

### ProtectedRoute

- `loading === true`: 전체화면 로딩 스피너 표시
- `user === null`: `/login?next={현재경로}`로 리다이렉트
- `user !== null`: children 렌더링

### LoginPage

- shadcn `Card` 컨테이너 (중앙 정렬, 모바일 전체 높이)
- 앱 로고 및 서비스명 "Trail"
- 서비스 한줄 설명: "등산 위치 공유 서비스"
- 구글 로그인 버튼 (흰 배경 + 검정 텍스트 + 구글 아이콘)
- 카카오 로그인 버튼 (카카오 옐로우 배경 + 검정 텍스트 + 카카오 아이콘)
- **로딩 상태:** 버튼 클릭 시 해당 버튼에만 per-button 로딩 스피너 표시 + 두 버튼 모두 비활성화 (전역 `AuthContext.loading`과 별도)
- 이미 로그인된 유저 접근 시 `/`로 리다이렉트

### AuthCallbackPage

- 전체화면 로딩 스피너 표시
- `supabase.auth.exchangeCodeForSession()` 호출 (PKCE 코드 교환)
- 성공 시 URL의 `next` 파라미터 또는 `/`로 리다이렉트
- 실패 시 에러 메시지와 함께 `/login`으로 리다이렉트

## UI / 디자인

- **컬러:** 화이트/블랙 베이스, shadcn `neutral` 팔레트
- **레이아웃:** 모바일 퍼스트, 세로 중앙 정렬
- **폰트:** shadcn 기본값 (시스템 폰트)
- **아이콘:** lucide-react (shadcn 번들)

## 에러 처리

| 상황 | 처리 |
|------|------|
| OAuth 취소 (사용자 뒤로가기) | `/login`으로 조용히 복귀 |
| 네트워크 오류 | shadcn `Toast` — "연결을 확인해주세요" |
| OAuth 제공자 오류 | shadcn `Toast` — "잠시 후 다시 시도해주세요" |
| 이미 로그인 상태에서 `/login` 접근 | `/`로 리다이렉트 |
| Refresh token 만료 (장기 미사용) | `user`가 `null`이 되어 자동으로 `/login`으로 이동 |

## Supabase 설정 요구사항

### Google OAuth
- Google Cloud Console에서 OAuth 2.0 앱 등록
- Supabase 대시보드 > Authentication > Providers > Google 활성화
- Redirect URL: `{앱 도메인}/auth/callback`

### Kakao Custom OAuth
- Kakao Developers에서 앱 등록, 필요 scope: `profile_nickname`, `account_email`
- Supabase 대시보드 > Authentication > Providers > Custom OAuth (Kakao) 설정
  - Authorization URL, Token URL, Client ID/Secret 등록
  - **별도 백엔드 불필요** — Supabase가 토큰 교환을 대신 처리
- Redirect URL: `{앱 도메인}/auth/callback`

## 세션 저장소

- Supabase JS v2 기본값인 `localStorage` 사용
- 모바일 브라우저 시크릿 모드에서는 `localStorage`가 탭 종료 시 초기화될 수 있음 → 허용 가능한 동작으로 간주

## 범위 외 (이번 스펙 제외)

- 회원가입 추가 정보 입력 (닉네임, 프로필 사진)
- 계정 삭제
- 실시간 위치 공유 기능
- 그룹 생성/참여 기능
