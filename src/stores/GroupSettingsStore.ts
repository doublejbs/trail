import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';
import type { Checkpoint } from '../types/checkpoint';
import type { GroupInvite, GroupMember } from '../types/invite';

class GroupSettingsStore {
  private navigate: NavigateFunction;
  public group: Group | null | undefined = undefined;
  public currentUserId: string | null = null;
  public maxInput: string = '';
  public invites: GroupInvite[] = [];
  public members: GroupMember[] = [];
  public error: string | null = null;
  public checkpoints: Checkpoint[] = [];

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
      this.loadCheckpoints(groupId),
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
    const { data: memberData, error } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId);

    if (error) {
      runInAction(() => { this.error = error.message; });
      return;
    }

    const members = memberData ?? [];
    const userIds = members.map((m) => m.user_id);

    const { data: profileData } = userIds.length
      ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
      : { data: [] };

    const profileMap = Object.fromEntries((profileData ?? []).map((p) => [p.id, p.display_name]));

    runInAction(() => {
      this.members = members.map((m) => ({
        ...m,
        profiles: { display_name: profileMap[m.user_id] ?? null },
      }));
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

  public get isPeriodActive(): boolean {
    if (!this.group) return false;
    const g = this.group;
    if (!g.period_started_at) return false;
    if (g.period_ended_at && new Date(g.period_ended_at).getTime() < Date.now()) return false;
    return true;
  }

  public async startPeriod(groupId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('groups')
      .update({ period_started_at: now, period_ended_at: null })
      .eq('id', groupId);
    if (error) {
      toast.error(`활동 시작 실패: ${error.message}`);
      return;
    }
    runInAction(() => {
      if (this.group) {
        this.group = { ...this.group, period_started_at: now, period_ended_at: null };
      }
    });
    toast.success('활동이 시작되었습니다');
  }

  public async endPeriod(groupId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('groups')
      .update({ period_ended_at: now })
      .eq('id', groupId);
    if (error) {
      toast.error(`활동 종료 실패: ${error.message}`);
      return;
    }
    await supabase
      .from('tracking_sessions')
      .update({ status: 'completed' })
      .eq('group_id', groupId)
      .in('status', ['active', 'paused']);

    runInAction(() => {
      if (this.group) {
        this.group = { ...this.group, period_ended_at: now };
      }
    });
    toast.success('활동이 종료되었습니다');
  }
  public async loadCheckpoints(groupId: string): Promise<void> {
    const { data, error } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order', { ascending: true });

    runInAction(() => {
      if (error) {
        this.error = error.message;
      } else {
        this.checkpoints = (data ?? []) as Checkpoint[];
      }
    });
  }

  public async addCheckpoint(
    groupId: string,
    lat: number,
    lng: number,
    name: string,
    radiusM: number,
    sortOrder: number,
  ): Promise<void> {
    const { data, error } = await supabase
      .from('checkpoints')
      .insert({
        group_id: groupId,
        name,
        lat,
        lng,
        radius_m: radiusM,
        sort_order: sortOrder,
        is_finish: false,
      })
      .select()
      .single();

    if (error) {
      toast.error(`체크포인트 추가 실패: ${error.message}`);
      return;
    }

    runInAction(() => {
      this.checkpoints = [...this.checkpoints, data as Checkpoint]
        .sort((a, b) => a.sort_order - b.sort_order);
    });
  }

  public async updateCheckpoint(
    id: string,
    updates: { name?: string; radius_m?: number; lat?: number; lng?: number; sort_order?: number },
  ): Promise<void> {
    const { error } = await supabase
      .from('checkpoints')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast.error(`체크포인트 수정 실패: ${error.message}`);
      return;
    }

    runInAction(() => {
      this.checkpoints = this.checkpoints
        .map((cp) => (cp.id === id ? { ...cp, ...updates } : cp))
        .sort((a, b) => a.sort_order - b.sort_order);
    });
  }

  public async removeCheckpoint(id: string): Promise<void> {
    const target = this.checkpoints.find((cp) => cp.id === id);
    if (target?.is_finish) {
      toast.error('종료 체크포인트는 삭제할 수 없습니다');
      return;
    }

    const { error } = await supabase
      .from('checkpoints')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error(`체크포인트 삭제 실패: ${error.message}`);
      return;
    }

    runInAction(() => {
      this.checkpoints = this.checkpoints.filter((cp) => cp.id !== id);
    });
  }
}

export { GroupSettingsStore };
