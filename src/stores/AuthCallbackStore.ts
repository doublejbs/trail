import { makeAutoObservable } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

class AuthCallbackStore {
  private navigate: NavigateFunction;
  private _handled: boolean = false;

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    makeAutoObservable(this);
  }

  public async handleCallback(next: string): Promise<void> {
    if (this._handled) return;
    this._handled = true;

    // detectSessionInUrl: true(기본값)로 Supabase가 URL의 code를 자동 처리함.
    // getSession()이 세션을 반환할 때까지 기다린다.
    const session = await this._waitForSession();

    if (!session) {
      this.navigate('/login', { replace: true });
      return;
    }

    const pendingToken = sessionStorage.getItem('pendingInviteToken');
    if (pendingToken) {
      sessionStorage.removeItem('pendingInviteToken');
      const { data: joinData } = await supabase.rpc('join_group_by_token', { p_token: pendingToken });
      if (
        joinData &&
        (joinData.status === 'joined' || joinData.status === 'already_member') &&
        joinData.group_id
      ) {
        this.navigate(`/group/${joinData.group_id}`, { replace: true });
        return;
      }
      this.navigate(`/invite/${pendingToken}`, { replace: true });
      return;
    }

    this.navigate(next || '/', { replace: true });
  }

  private _waitForSession(): Promise<Session | null> {
    return new Promise((resolve) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) { resolve(session); return; }

        // 아직 세션이 없으면 onAuthStateChange로 대기
        const timer = setTimeout(() => {
          subscription.unsubscribe();
          resolve(null);
        }, 10_000);

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            clearTimeout(timer);
            subscription.unsubscribe();
            resolve(session);
          } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
            clearTimeout(timer);
            subscription.unsubscribe();
            resolve(null);
          }
        });
      });
    });
  }
}

export { AuthCallbackStore };
