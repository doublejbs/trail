# Trail — 로그인 기능 디자인 스펙

## 개요

Trail은 등산 중 그룹 멤버 간 실시간 위치를 공유하는 지도 기반 모바일 웹 서비스다. 이 문서는 초기 로그인 기능의 설계를 정의한다.

## 기술 스택

- **Frontend:** Vite + React (SPA)
- **Auth Backend:** Supabase Auth
- **UI:** shadcn/ui (neutral 팔레트, 화이트/블랙 테마)
- **OAuth Providers:** Google (네이티브), Kakao (Custom OAuth Provider)

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
└── App.tsx                   # 라우팅 설정
```

### 인증 플로우

1. 비인증 유저가 보호된 경로 접근 → `/login`으로 리다이렉트
2. 구글 또는 카카오 버튼 클릭 → `supabase.auth.signInWithOAuth()` 호출
3. OAuth 제공자 인증 완료 후 `/auth/callback`으로 리다이렉트
4. Supabase가 토큰 교환 처리 → 세션 로컬 스토리지에 저장
5. 홈(`/`)으로 리다이렉트

## 컴포넌트 설계

### AuthContext

```ts
interface AuthContextType {
  user: User | null       // Supabase User, null이면 비로그인
  loading: boolean        // 초기 세션 확인 중
  signOut: () => Promise<void>
}
```

- `onAuthStateChange`로 세션 변경을 구독
- 앱 최상단에서 모든 자식 컴포넌트에 인증 상태 제공

### ProtectedRoute

- `loading === true`: 전체화면 로딩 스피너 표시
- `user === null`: `/login`으로 리다이렉트
- `user !== null`: children 렌더링

### LoginPage

- shadcn `Card` 컨테이너 (중앙 정렬, 모바일 전체 높이)
- 앱 로고 및 서비스명 "Trail"
- 서비스 한줄 설명: "등산 위치 공유 서비스"
- 구글 로그인 버튼 (흰 배경 + 검정 텍스트 + 구글 아이콘)
- 카카오 로그인 버튼 (카카오 옐로우 배경 + 검정 텍스트 + 카카오 아이콘)
- 로딩 중 버튼 비활성화 + 스피너
- 이미 로그인된 유저 접근 시 `/`로 리다이렉트

### AuthCallbackPage

- 전체화면 로딩 스피너 표시
- Supabase가 URL hash에서 토큰을 자동 처리
- 성공 시 `/`로 리다이렉트
- 실패 시 에러 파라미터와 함께 `/login`으로 리다이렉트

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

## Supabase 설정 요구사항

- Supabase 프로젝트에서 Google OAuth 활성화 (Google Cloud Console 앱 등록)
- Supabase 프로젝트에서 Kakao Custom OAuth Provider 설정 (Kakao Developers 앱 등록)
- Redirect URL: `{앱 도메인}/auth/callback`

## 범위 외 (이번 스펙 제외)

- 회원가입 추가 정보 입력 (닉네임, 프로필 사진)
- 계정 삭제
- 실시간 위치 공유 기능
- 그룹 생성/참여 기능
