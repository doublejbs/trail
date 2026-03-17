import { makeAutoObservable, runInAction } from 'mobx';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

class AuthStore {
  public user: User | null = null;
  public loading: boolean = true;
  private _exchangeAttempted: boolean = false;

  public constructor() {
    makeAutoObservable(this);
  }

  public initialize(): () => void {
    supabase.auth.getSession().then(({ data: { session } }) => {
      runInAction(() => {
        this.user = session?.user ?? null;
        this.loading = false;
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      runInAction(() => {
        this.user = session?.user ?? null;
      });
    });

    return () => subscription.unsubscribe();
  }

  public async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  public async exchangeCode(code: string): Promise<boolean> {
    if (this._exchangeAttempted) {
      return false;
    }
    this._exchangeAttempted = true;
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      runInAction(() => {
        this.user = data.session!.user;
      });
      return true;
    }
    return false;
  }
}

export { AuthStore };
