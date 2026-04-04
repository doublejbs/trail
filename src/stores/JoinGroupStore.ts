import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type JoinStatus = 'idle' | 'loading' | 'ready' | 'joining' | 'success' | 'already_member' | 'full' | 'invalid';

interface GroupPreview {
  id: string;
  name: string;
  thumbnail_path: string | null;
  gpx_bucket: string;
  member_count: number;
  max_members: number | null;
}

class JoinGroupStore {
  private navigate: NavigateFunction;
  public status: JoinStatus = 'idle';
  public groupId: string | null = null;
  public groupPreview: GroupPreview | null = null;
  public sessionChecked: boolean = false;
  public isLoggedIn: boolean = false;
  private token: string | null = null;

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    makeAutoObservable(this);
  }

  public async checkAndPreview(token: string): Promise<void> {
    this.token = token;

    const { data: { session } } = await supabase.auth.getSession();
    runInAction(() => {
      this.isLoggedIn = !!session;
      this.sessionChecked = true;
    });

    if (!session) {
      sessionStorage.setItem('pendingInviteToken', token);
      this.navigate(`/login?next=${encodeURIComponent(`/invite/${token}`)}`, { replace: true });
      return;
    }

    await this.fetchGroupPreview(token);
  }

  private async fetchGroupPreview(token: string): Promise<void> {
    runInAction(() => {
      this.status = 'loading';
    });

    const { data, error } = await supabase.rpc('preview_invite', { p_token: token });

    if (error || !data) {
      runInAction(() => { this.status = 'invalid'; });
      return;
    }

    if (data.status === 'invalid') {
      runInAction(() => { this.status = 'invalid'; });
      return;
    }

    if (data.status === 'full') {
      runInAction(() => { this.status = 'full'; });
      return;
    }

    if (data.status === 'already_member') {
      runInAction(() => {
        this.status = 'already_member';
        this.groupId = data.group_id;
      });
      this.navigate(`/group/${data.group_id}`, { replace: true });
      return;
    }

    runInAction(() => {
      this.groupPreview = {
        id: data.group_id,
        name: data.group_name,
        thumbnail_path: data.thumbnail_path,
        gpx_bucket: data.gpx_bucket,
        member_count: data.member_count,
        max_members: data.max_members,
      };
      this.groupId = data.group_id;
      this.status = 'ready';
    });
  }

  public async confirmJoin(): Promise<void> {
    if (!this.token) return;

    runInAction(() => { this.status = 'joining'; });

    const { data, error } = await supabase.rpc('join_group_by_token', { p_token: this.token });

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
      this.groupId = data.group_id ?? this.groupId;
    });

    if ((this.status === 'success' || this.status === 'already_member') && this.groupId) {
      this.navigate(`/group/${this.groupId}`, { replace: true });
    }
  }
}

export { JoinGroupStore };
