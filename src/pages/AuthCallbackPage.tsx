import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { AuthStore } from "../stores/AuthStore";

export const AuthCallbackPage = observer(() => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [store] = useState(() => new AuthStore());
  const [exchanged, setExchanged] = useState(false);
  const next = searchParams.get("next") ?? "/";

  // Step 1: exchange the code (once — guard inside AuthStore prevents double-invoke)
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      navigate("/login", { replace: true });
      return;
    }
    store.exchangeCode(code).then((success) => {
      if (success) {
        setExchanged(true);
      } else {
        navigate("/login", { replace: true });
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
