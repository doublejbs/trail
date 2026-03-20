import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { GroupInvite, GroupMember } from '../types/invite';

class GroupInviteStore {
  public invites: GroupInvite[] = [];
  public members: GroupMember[] = [];
  public loading: boolean = false;
  public error: string | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public async fetchInvites(groupId: string): Promise<void> {
    this.loading = true;
    this.error = null;

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
      this.loading = false;
    });
  }

  public async fetchMembers(groupId: string): Promise<void> {
    this.loading = true;
    this.error = null;

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
      this.loading = false;
    });
  }

  public async createInvite(groupId: string): Promise<void> {
    this.error = null;

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
    this.error = null;

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
    this.error = null;

    const { error } = await supabase
      .from('groups')
      .update({ max_members: max })
      .eq('id', groupId);

    if (error) {
      runInAction(() => {
        this.error = error.message;
      });
    }
  }
}

export { GroupInviteStore };
