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
