import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

class GroupCreateStore {
  private navigate: NavigateFunction;
  public name: string = '';
  public file: File | null = null;
  public submitting: boolean = false;
  public error: string | null = null;

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    makeAutoObservable(this);
  }

  public setName(v: string): void {
    this.name = v;
  }

  public setFile(f: File | null): void {
    this.file = f;
  }

  public get isValid(): boolean {
    return this.name.trim() !== '' && this.file !== null;
  }

  public async submit(): Promise<void> {
    runInAction(() => {
      this.submitting = true;
      this.error = null;
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      runInAction(() => {
        this.error = '인증 오류가 발생했습니다';
        this.submitting = false;
      });
      toast.error(this.error!);
      return;
    }

    const userId = userData.user.id;
    const groupId = crypto.randomUUID();
    const path = `${userId}/${groupId}.gpx`;

    const { error: uploadError } = await supabase.storage
      .from('gpx-files')
      .upload(path, this.file!);

    if (uploadError) {
      runInAction(() => {
        this.error = uploadError.message;
        this.submitting = false;
      });
      toast.error(this.error!);
      return;
    }

    const { error: insertError } = await supabase
      .from('groups')
      .insert({ id: groupId, name: this.name, created_by: userId, gpx_path: path });

    if (insertError) {
      runInAction(() => {
        this.error = insertError.message;
        this.submitting = false;
      });
      toast.error(this.error!);
      return;
    }

    runInAction(() => { this.submitting = false; });
    this.navigate('/group');
  }
}

export { GroupCreateStore };
