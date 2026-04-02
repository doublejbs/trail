import { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Loader2 } from 'lucide-react';
import { AuthStore } from '../stores/AuthStore';
import { LoginStore } from '../stores/LoginStore';

export const LoginPage = observer(() => {
  const [authStore] = useState(() => new AuthStore());
  const [store] = useState(() => new LoginStore());
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
    ? rawNext
    : null;

  useEffect(() => authStore.initialize(), [authStore]);

  if (!authStore.loading && authStore.user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = (provider: 'google' | 'kakao') => {
    const redirectTo = next
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth/callback`;
    store.login(provider, redirectTo);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      {/* Brand */}
      <div className="mb-10 text-center anim-fade-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-black mb-5">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 18L8 10L12 14L16 6L20 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-[28px] font-extrabold tracking-tight text-black">Trail</h1>
        <p className="text-[14px] text-black/40 mt-1.5 font-medium">등산 위치 공유 서비스</p>
      </div>

      {/* Buttons */}
      <div className="w-full max-w-[320px] flex flex-col gap-3 anim-fade-up-1">
        <button
          onClick={() => handleLogin('google')}
          disabled={store.isLoading}
          aria-label="구글로 로그인"
          className="w-full h-[52px] flex items-center justify-center gap-2.5 rounded-xl border border-black/10 bg-white text-[14px] font-semibold text-black active:bg-black/[0.03] transition-colors disabled:opacity-50"
        >
          {store.loadingProvider === 'google' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          구글로 시작하기
        </button>
        <button
          onClick={() => handleLogin('kakao')}
          disabled={store.isLoading}
          aria-label="카카오로 로그인"
          className="w-full h-[52px] flex items-center justify-center gap-2.5 rounded-xl bg-[#FEE500] text-[14px] font-semibold text-black/85 active:bg-[#F5DC00] transition-colors disabled:opacity-50"
        >
          {store.loadingProvider === 'kakao' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KakaoIcon />
          )}
          카카오로 시작하기
        </button>

      </div>

      <p className="text-[11px] text-black/25 mt-8 anim-fade-up-2">계속 진행하면 이용약관에 동의하는 것으로 간주됩니다</p>
    </div>
  );
});

function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="rgba(0,0,0,0.85)">
      <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.636 1.607 4.953 4.03 6.327L5.1 20.1a.375.375 0 0 0 .54.415L10.1 17.9A11.6 11.6 0 0 0 12 18c5.523 0 10-3.477 10-7.5S17.523 3 12 3z" />
    </svg>
  );
}

