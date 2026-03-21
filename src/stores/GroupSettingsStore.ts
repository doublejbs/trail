import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';
import type { GroupInvite, GroupMember } from '../types/invite';

class GroupSettingsStore {
  private navigate: NavigateFunction;
  public group: Group | null | undefined = undefined;
  public currentUserId: string | null = null;
  public maxInput: string = '';
  public invites: GroupInvite[] = [];
  public members: GroupMember[] = [];
  public error: string | null = null;

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    makeAutoObservable(this);
  }

  public async load(groupId: string): Promise<void> {
    const [{ data: userData }, { data: groupData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('groups').select('*').eq('id', groupId).single(),
    ]);

    runInAction(() => {
      const userId = userData?.user?.id ?? null;
      this.currentUserId = userId;
      this.group = (groupData as Group | null) ?? null;
      if (this.group) {
        this.maxInput = (this.group as Group).max_members?.toString() ?? '';
      }
    });

    if (!this.group) {
      this.navigate('/group', { replace: true });
      return;
    }

    if (!this.currentUserId || this.currentUserId !== (this.group as Group).created_by) {
      this.navigate(`/group/${groupId}`, { replace: true });
      return;
    }

    await Promise.all([
      this.fetchInvites(groupId),
      this.fetchMembers(groupId),
    ]);
  }

  public setMaxInput(val: string): void {
    this.maxInput = val;
  }

  public async fetchInvites(groupId: string): Promise<void> {
    const { data, error } = await supabase
      .from('group_invites')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    runInAction(() => {
      if (error) {
        this.error = error.message;
      } else {
        this.invites = data ?? [];
      }
    });
  }

  public async fetchMembers(groupId: string): Promise<void> {
    const { data, error } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId);

    runInAction(() => {
      if (error) {
        this.error = error.message;
      } else {
        this.members = data ?? [];
      }
    });
  }

  public async createInvite(groupId: string): Promise<void> {
    const { data, error } = await supabase
      .from('group_invites')
      .insert({ group_id: groupId })
      .select();

    runInAction(() => {
      if (error) {
        this.error = error.message;
      } else if (data) {
        this.invites = [...(data as GroupInvite[]), ...this.invites];
      }
    });
  }

  public async deactivateInvite(inviteId: string): Promise<void> {
    const { error } = await supabase
      .from('group_invites')
      .update({ is_active: false })
      .eq('id', inviteId);

    runInAction(() => {
      if (error) {
        this.error = error.message;
      } else {
        this.invites = this.invites.map((inv) =>
          inv.id === inviteId ? { ...inv, is_active: false } : inv
        );
      }
    });
  }

  public async updateMaxMembers(groupId: string, max: number | null): Promise<void> {
    const { error } = await supabase
      .from('groups')
      .update({ max_members: max })
      .eq('id', groupId);

    runInAction(() => {
      if (error) this.error = error.message;
    });
  }
}

export { GroupSettingsStore };
