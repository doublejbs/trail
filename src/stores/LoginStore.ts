import { makeAutoObservable, runInAction } from 'mobx';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

type LoginProvider = 'google' | 'kakao' | 'naver';

class LoginStore {
  public loadingProvider: LoginProvider | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public async login(provider: LoginProvider, redirectTo: string): Promise<void> {
    runInAction(() => { this.loadingProvider = provider; });
    try {
      const providerKey = provider === 'naver' ? 'custom:naver' : provider;
      if (Capacitor.isNativePlatform()) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: providerKey as 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) throw error;
        if (data.url) {
          await Browser.open({ url: data.url });
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: providerKey as 'google',
          options: { redirectTo },
        });
        if (error) throw error;
      }
    } catch {
      runInAction(() => { this.loadingProvider = null; });
      toast.error('잠시 후 다시 시도해주세요');
    }
  }

  public get isLoading(): boolean {
    return this.loadingProvider !== null;
  }
}

export { LoginStore };
