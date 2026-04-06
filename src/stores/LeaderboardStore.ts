import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';

interface Ranking {
  userId: string;
  displayName: string;
  maxRouteMeters: number;
  isLive: boolean;
  lat: number | null;
  lng: number | null;
  avatarUrl: string | null;
  checkpointsVisited: number;
}

class LeaderboardStore {
  public rankings: Ranking[] = [];
  public loading: boolean = false;
  public error: string | null = null;
  private _channel: ReturnType<typeof supabase.channel> | null = null;
  private groupId: string;

  constructor(groupId: string) {
    this.groupId = groupId;
    makeAutoObservable(this);
  }

  async load(periodStartedAt: Date | null): Promise<void> {
    if (this._channel) {
      void supabase.removeChannel(this._channel);
      runInAction(() => { this._channel = null; });
    }

    runInAction(() => { this.loading = true; this.error = null; });

    try {
      let query = supabase
        .from('tracking_sessions')
        .select('id, user_id, max_route_meters, created_at')
        .eq('group_id', this.groupId);
      if (periodStartedAt) {
        query = query.gte('created_at', periodStartedAt.toISOString());
      }
      const { data: sessions, error: sessionsError } = await query;
      if (sessionsError) throw sessionsError;

      // 유저별 최신 세션 ID (체크포인트 집계용)
      const latestSessionByUser = new Map<string, { id: string; createdAt: string }>();
      for (const s of sessions ?? []) {
        const prev = latestSessionByUser.get(s.user_id);
        if (!prev || s.created_at > prev.createdAt) {
          latestSessionByUser.set(s.user_id, { id: s.id, createdAt: s.created_at });
        }
      }
      const latestSessionIds = [...latestSessionByUser.values()].map((v) => v.id);

      const maxByUser = new Map<string, number>();
      for (const row of sessions ?? []) {
        const prev = maxByUser.get(row.user_id) ?? 0;
        maxByUser.set(row.user_id, Math.max(prev, row.max_route_meters ?? 0));
      }

      const userIds = [...maxByUser.keys()];
      const nameMap = new Map<string, string>();
      const avatarUrlMap = new Map<string, string | null>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_path')
          .in('id', userIds);
        await Promise.all((profiles ?? []).map(async (p) => {
          nameMap.set(p.id, p.display_name);
          if (p.avatar_path) {
            const { data: signed } = await supabase.storage
              .from('avatars')
              .createSignedUrl(p.avatar_path, 3600);
            avatarUrlMap.set(p.id, signed?.signedUrl ?? null);
          } else {
            avatarUrlMap.set(p.id, null);
          }
        }));
      }

      // 체크포인트 통과 수 집계: 현재 기간 세션 + 현재 존재하는 체크포인트만
      const checkpointCountMap = new Map<string, number>();
      if (latestSessionIds.length > 0) {
        const [{ data: visits }, { data: currentCheckpoints }] = await Promise.all([
          supabase
            .from('checkpoint_visits')
            .select('user_id, checkpoint_id')
            .in('tracking_session_id', latestSessionIds),
          supabase
            .from('checkpoints')
            .select('id')
            .eq('group_id', this.groupId),
        ]);
        const validCpIds = new Set((currentCheckpoints ?? []).map((cp) => cp.id));
        if (visits) {
          const byUser = new Map<string, Set<string>>();
          for (const v of visits) {
            if (!validCpIds.has(v.checkpoint_id)) continue;
            if (!byUser.has(v.user_id)) byUser.set(v.user_id, new Set());
            byUser.get(v.user_id)!.add(v.checkpoint_id);
          }
          for (const [uid, cpIds] of byUser) {
            checkpointCountMap.set(uid, cpIds.size);
          }
        }
      }

      // group_member_positions에서 그룹 전체 위치 조회 (tracking session 없는 멤버 포함)
      const positionMap = new Map<string, { lat: number; lng: number }>();
      const { data: positions } = await supabase
        .from('group_member_positions')
        .select('user_id, lat, lng')
        .eq('group_id', this.groupId);
      for (const p of positions ?? []) {
        positionMap.set(p.user_id, { lat: p.lat, lng: p.lng });
      }

      // tracking session 없지만 위치가 있는 멤버 프로필 추가 조회
      const positionOnlyIds = [...positionMap.keys()].filter((id) => !maxByUser.has(id));
      if (positionOnlyIds.length > 0) {
        const { data: extraProfiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_path')
          .in('id', positionOnlyIds);
        await Promise.all((extraProfiles ?? []).map(async (p) => {
          nameMap.set(p.id, p.display_name);
          if (p.avatar_path) {
            const { data: signed } = await supabase.storage
              .from('avatars')
              .createSignedUrl(p.avatar_path, 3600);
            avatarUrlMap.set(p.id, signed?.signedUrl ?? null);
          } else {
            avatarUrlMap.set(p.id, null);
          }
        }));
      }

      // 전체 유저 집합: tracking session + position-only
      const allUserIds = new Set([...maxByUser.keys(), ...positionMap.keys()]);

      runInAction(() => {
        this.rankings = [...allUserIds]
          .map((userId) => ({
            userId,
            displayName: nameMap.get(userId) ?? '알 수 없음',
            maxRouteMeters: maxByUser.get(userId) ?? 0,
            isLive: false,
            lat: positionMap.get(userId)?.lat ?? null,
            lng: positionMap.get(userId)?.lng ?? null,
            avatarUrl: avatarUrlMap.get(userId) ?? null,
            checkpointsVisited: checkpointCountMap.get(userId) ?? 0,
          }))
          .sort((a, b) => b.maxRouteMeters - a.maxRouteMeters);
        this.loading = false;
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : '순위 불러오기 실패';
        this.loading = false;
      });
      return;
    }

    const channel = supabase.channel(`group-progress:${this.groupId}`);
    console.log('[LeaderboardStore] subscribing to channel:', `group-progress:${this.groupId}`);
    channel.on('broadcast', { event: 'progress' }, (msg) => {
      console.log('[LeaderboardStore] broadcast received:', msg.payload);
      const { userId, displayName, maxRouteMeters, lat, lng, checkpointsVisited } = msg.payload as {
        userId: string;
        displayName: string;
        maxRouteMeters: number;
        lat: number | null;
        lng: number | null;
        checkpointsVisited?: number;
      };
      runInAction(() => {
        const existing = this.rankings.find((r) => r.userId === userId);
        if (existing) {
          existing.maxRouteMeters = maxRouteMeters;
          if (existing.displayName === '알 수 없음') existing.displayName = displayName;
          existing.isLive = true;
          if (checkpointsVisited != null) existing.checkpointsVisited = checkpointsVisited;
          if (lat != null) existing.lat = lat;
          if (lng != null) existing.lng = lng;
        } else {
          this.rankings.push({ userId, displayName, maxRouteMeters, isLive: true, lat, lng, avatarUrl: null, checkpointsVisited: checkpointsVisited ?? 0 });
        }
        this.rankings.sort((a, b) => b.maxRouteMeters - a.maxRouteMeters);
      });
    });
    channel.subscribe();
    this._channel = channel;
  }

  dispose(): void {
    if (this._channel) {
      void supabase.removeChannel(this._channel);
      this._channel = null;
    }
  }
}

export { LeaderboardStore };
export type { Ranking };
