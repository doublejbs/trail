import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';

type JoinStatus = 'idle' | 'loading' | 'success' | 'already_member' | 'full' | 'invalid';

class JoinGroupStore {
  public status: JoinStatus = 'idle';
  public groupId: string | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public async joinByToken(token: string): Promise<void> {
    this.status = 'loading';
    this.groupId = null;

    const { data, error } = await supabase.rpc('join_group_by_token', { p_token: token });

    runInAction(() => {
      if (error || !data) {
        this.status = 'invalid';
        return;
      }
      if (data.status === 'joined') {
        this.status = 'success';
      } else {
        this.status = data.status as JoinStatus;
      }
      this.groupId = data.group_id ?? null;
    });
  }
}

export { JoinGroupStore };
