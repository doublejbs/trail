import { makeAutoObservable } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../lib/supabase';

class AuthCallbackStore {
  private navigate: NavigateFunction;
  private _exchangeAttempted: boolean = false;

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    makeAutoObservable(this);
  }

  public async handleCallback(code: string | null, next: string): Promise<void> {
    console.log('[AuthCallback] code:', code, 'next:', next, 'url:', window.location.href);
    if (!code) {
      console.warn('[AuthCallback] No code param, redirecting to /login');
      this.navigate('/login', { replace: true });
      return;
    }
    if (this._exchangeAttempted) return;
    this._exchangeAttempted = true;

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    console.log('[AuthCallback] exchange result:', { session: !!data.session, error });
    const success = !error && !!data.session;
    this.navigate(success ? next : '/login', { replace: true });
  }
}

export { AuthCallbackStore };
