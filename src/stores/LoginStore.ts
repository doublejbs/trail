import { makeAutoObservable, runInAction } from 'mobx';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

type Provider = 'google' | 'kakao';

class LoginStore {
  public loadingProvider: Provider | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public async login(provider: Provider, redirectTo: string): Promise<void> {
    runInAction(() => { this.loadingProvider = provider; });
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
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
