import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

class ProfileStore {
  public displayName: string = '';
  public avatarUrl: string | null = null;
  public loading: boolean = false;
  public saving: boolean = false;
  public uploadingAvatar: boolean = false;

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
        .select('display_name, avatar_path')
        .eq('id', user.id)
        .single();

      let avatarUrl: string | null = null;
      if (data?.avatar_path) {
        const { data: signed } = await supabase.storage
          .from('avatars')
          .createSignedUrl(data.avatar_path, 3600);
        avatarUrl = signed?.signedUrl ?? null;
      }

      runInAction(() => {
        this.displayName = data?.display_name ?? '';
        this.avatarUrl = avatarUrl;
        this.loading = false;
      });
    } catch {
      runInAction(() => { this.loading = false; });
    }
  }

  async uploadAvatar(file: File): Promise<void> {
    runInAction(() => { this.uploadingAvatar = true; });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('미인증');

      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', user.id);

      if (profileError) throw profileError;

      const { data: signed } = await supabase.storage
        .from('avatars')
        .createSignedUrl(path, 3600);

      runInAction(() => {
        this.avatarUrl = signed?.signedUrl ?? null;
        this.uploadingAvatar = false;
      });
      toast.success('프로필 사진이 변경되었습니다');
    } catch {
      runInAction(() => { this.uploadingAvatar = false; });
      toast.error('사진 업로드에 실패했습니다');
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
