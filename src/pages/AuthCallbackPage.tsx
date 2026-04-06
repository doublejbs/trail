import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthCallbackStore } from "../stores/AuthCallbackStore";

export const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [store] = useState(() => new AuthCallbackStore(navigate));

  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : "/";

  useEffect(() => {
    const code = searchParams.get("code");
    const isNativeCallback = searchParams.get("native") === "1";

    // 네이티브 앱에서 인앱 브라우저로 OAuth 진행 후 콜백:
    // 커스텀 스킴으로 네이티브 앱에 code를 전달하여 앱으로 복귀
    if (code && isNativeCallback) {
      window.location.href = `com.trail.app://auth/callback?code=${code}`;
      return;
    }

    store.handleCallback(next);
  }, [store, next, searchParams]);

  return (
    <div
      role="status"
      className="flex h-screen items-center justify-center"
      aria-label="로그인 처리 중"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-transparent" />
    </div>
  );
};
