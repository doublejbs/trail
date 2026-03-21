import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type JoinStatus = 'idle' | 'loading' | 'success' | 'already_member' | 'full' | 'invalid';

class JoinGroupStore {
  private navigate: NavigateFunction;
  public status: JoinStatus = 'idle';
  public groupId: string | null = null;
  public sessionChecked: boolean = false;
  public isLoggedIn: boolean = false;

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    makeAutoObservable(this);
  }

  public async checkAndJoin(token: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    runInAction(() => {
      this.isLoggedIn = !!session;
      this.sessionChecked = true;
    });

    if (!session) {
      this.navigate(`/login?next=${encodeURIComponent(`/invite/${token}`)}`, { replace: true });
      return;
    }

    await this.joinByToken(token);
  }

  private async joinByToken(token: string): Promise<void> {
    runInAction(() => {
      this.status = 'loading';
      this.groupId = null;
    });

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

    if (
      (this.status === 'success' || this.status === 'already_member') &&
      this.groupId
    ) {
      this.navigate(`/group/${this.groupId}`, { replace: true });
    }
  }
}

export { JoinGroupStore };
