import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthCallbackStore } from "../stores/AuthCallbackStore";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [store] = useState(() => new AuthCallbackStore(navigate));

  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : "/";

  useEffect(() => {
    const code = searchParams.get("code");
    store.handleCallback(code, next);
  }, [store, searchParams, next]);

  return (
    <div
      role="status"
      className="flex h-screen items-center justify-center"
      aria-label="로그인 처리 중"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-transparent" />
    </div>
  );
}
