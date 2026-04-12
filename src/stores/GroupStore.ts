import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { Group, GroupMemberPreview } from '../types/group';

export type GroupTab = 'joined' | 'explore';
export type GroupFilter = 'all' | 'active' | 'mine' | 'ended';

class GroupStore {
  public groups: Group[] = [];
  public loading: boolean = true;
  public membersLoading: boolean = true;
  public error: boolean = false;
  public currentUserId: string | null = null;
  public tab: GroupTab = 'joined';
  public filter: GroupFilter = 'all';
  public joinedGroupIds: Set<string> = new Set();

  public constructor() {
    makeAutoObservable(this);
  }

  public setTab(t: GroupTab): void {
    this.tab = t;
  }

  public setFilter(f: GroupFilter): void {
    this.filter = f;
  }

  public async load(options?: { withMembership?: boolean }): Promise<void> {
    this.loading = true;
    this.membersLoading = true;
    this.error = false;

    const [{ data: userData }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('groups')
        .select('*, group_members(count)')
        .order('created_at', { ascending: false }),
    ]);

    const userId = userData?.user?.id ?? null;

    if (error) {
      runInAction(() => {
        this.error = true;
        this.loading = false;
        this.membersLoading = false;
      });
      return;
    }

    // 참가중 탭: 가입한 그룹 ID를 loading 해제 전에 조회
    let joinedIds = new Set<string>();
    if (options?.withMembership && userId) {
      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId);
      for (const m of memberships ?? []) joinedIds.add(m.group_id);
    }

    const groups: Group[] = (data ?? []).map((g: Record<string, unknown>) => {
      const counts = g.group_members as { count: number }[] | undefined;
      return { ...g, member_count: counts?.[0]?.count ?? 0 } as Group;
    });

    runInAction(() => {
      this.groups = groups;
      this.currentUserId = userId;
      this.joinedGroupIds = joinedIds;
      this.loading = false;
    });

    // 멤버 아바타 비동기 로드
    void this._loadMembers(groups);
  }

  private async _loadMembers(groups: Group[]): Promise<void> {
    const groupIds = groups.map((g) => g.id);
    const memberMap = new Map<string, GroupMemberPreview[]>();

    if (groupIds.length > 0) {
      const { data: membersData } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds)
        .order('joined_at', { ascending: true });

      if (membersData && membersData.length > 0) {
        const allUserIds = new Set<string>();
        for (const m of membersData) {
          const list = memberMap.get(m.group_id) ?? [];
          if (list.length < 3) {
            list.push({ user_id: m.user_id, avatar_url: null });
            allUserIds.add(m.user_id);
          }
          memberMap.set(m.group_id, list);
        }

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, avatar_path')
          .in('id', Array.from(allUserIds));

        const profileMap = new Map<string, string | null>();
        if (profilesData) {
          for (const p of profilesData) {
            profileMap.set(p.id, p.avatar_path ?? null);
          }
        }

        const avatarPaths: string[] = [];
        profileMap.forEach((path) => {
          if (path) avatarPaths.push(path);
        });

        const urlMap = new Map<string, string>();
        if (avatarPaths.length > 0) {
          const { data: urls } = await supabase.storage
            .from('avatars')
            .createSignedUrls(avatarPaths, 3600);
          if (urls) {
            for (const u of urls) {
              if (!u.error && u.signedUrl && u.path) {
                urlMap.set(u.path, u.signedUrl);
              }
            }
          }
        }

        memberMap.forEach((members) => {
          for (const mem of members) {
            const path = profileMap.get(mem.user_id);
            mem.avatar_url = (path && urlMap.get(path)) ?? null;
          }
        });
      }
    }

    runInAction(() => {
      this.groups = this.groups.map((g) => ({
        ...g,
        members: memberMap.get(g.id) ?? g.members ?? [],
      }));
      this.membersLoading = false;
    });
  }
}

export { GroupStore };
