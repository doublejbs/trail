import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

class ProfileStore {
  public displayName: string = '';
  public loading: boolean = false;
  public saving: boolean = false;

  constructor() {
    makeAutoObservable(this);
  }

  async load(): Promise<void> {
    runInAction(() => { this.loading = true; });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
      runInAction(() => {
        this.displayName = data?.display_name ?? '';
        this.loading = false;
      });
    } catch {
      runInAction(() => { this.loading = false; });
    }
  }

  async save(displayName: string): Promise<void> {
    runInAction(() => { this.saving = true; });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('미인증');
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, display_name: displayName }, { onConflict: 'id' });
      if (error) throw error;
      runInAction(() => {
        this.displayName = displayName;
        this.saving = false;
      });
      toast.success('프로필이 저장되었습니다');
    } catch {
      runInAction(() => { this.saving = false; });
      toast.error('프로필 저장에 실패했습니다');
    }
  }
}

export { ProfileStore };
