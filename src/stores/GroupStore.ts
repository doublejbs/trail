import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { Group, GroupMemberPreview } from '../types/group';

class GroupStore {
  public groups: Group[] = [];
  public loading: boolean = true;
  public error: boolean = false;
  public currentUserId: string | null = null;
  public onlyOwned: boolean = false;
  public activeTrackingGroupIds: string[] = [];

  public constructor() {
    makeAutoObservable(this);
  }

  public toggleOnlyOwned(): void {
    this.onlyOwned = !this.onlyOwned;
  }

  public async load(): Promise<void> {
    this.loading = true;
    this.error = false;

    const [{ data: userData }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('groups')
        .select('*, group_members(count)')
        .order('created_at', { ascending: false }),
    ]);

    const userId = userData?.user?.id ?? null;

    let activeGroupIds: string[] = [];
    if (userId) {
      const { data: sessions } = await supabase
        .from('tracking_sessions')
        .select('group_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      activeGroupIds = (sessions ?? []).map((s) => s.group_id);
    }

    if (error) {
      runInAction(() => {
        this.error = true;
        this.loading = false;
      });
      return;
    }

    const groups: Group[] = (data ?? []).map((g: Record<string, unknown>) => {
      const counts = g.group_members as { count: number }[] | undefined;
      return { ...g, member_count: counts?.[0]?.count ?? 0 } as Group;
    });

    // 각 그룹의 멤버 프로필(아바타) 로드 — 최대 3명씩
    const groupIds = groups.map((g) => g.id);
    const memberMap = new Map<string, GroupMemberPreview[]>();

    if (groupIds.length > 0) {
      // 1) 멤버 목록 가져오기
      const { data: membersData } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds)
        .order('joined_at', { ascending: true });

      if (membersData && membersData.length > 0) {
        // 그룹별 멤버 분류 (최대 3명)
        const allUserIds = new Set<string>();
        for (const m of membersData) {
          const list = memberMap.get(m.group_id) ?? [];
          if (list.length < 3) {
            list.push({ user_id: m.user_id, avatar_url: null });
            allUserIds.add(m.user_id);
          }
          memberMap.set(m.group_id, list);
        }

        // 2) 프로필(아바타) 별도 조회
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

        // 3) 아바타 signed URL 일괄 생성
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

        // 4) 멤버에 아바타 URL 매핑
        memberMap.forEach((members) => {
          for (const mem of members) {
            const path = profileMap.get(mem.user_id);
            mem.avatar_url = (path && urlMap.get(path)) ?? null;
          }
        });
      }
    }

    const enrichedGroups = groups.map((g) => ({
      ...g,
      members: memberMap.get(g.id) ?? [],
    }));

    runInAction(() => {
      this.groups = enrichedGroups;
      this.currentUserId = userId;
      this.activeTrackingGroupIds = activeGroupIds;
      this.loading = false;
    });
  }
}

export { GroupStore };
