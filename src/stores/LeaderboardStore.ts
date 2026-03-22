import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';

interface Ranking {
  userId: string;
  displayName: string;
  maxRouteMeters: number;
  isLive: boolean;
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
        .select('user_id, max_route_meters')
        .eq('group_id', this.groupId);
      if (periodStartedAt) {
        query = query.gte('created_at', periodStartedAt.toISOString());
      }
      const { data: sessions, error: sessionsError } = await query;
      if (sessionsError) throw sessionsError;

      const maxByUser = new Map<string, number>();
      for (const row of sessions ?? []) {
        const prev = maxByUser.get(row.user_id) ?? 0;
        maxByUser.set(row.user_id, Math.max(prev, row.max_route_meters ?? 0));
      }

      const userIds = [...maxByUser.keys()];
      const nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds);
        for (const p of profiles ?? []) {
          nameMap.set(p.id, p.display_name);
        }
      }

      runInAction(() => {
        this.rankings = [...maxByUser.entries()]
          .map(([userId, maxRouteMeters]) => ({
            userId,
            displayName: nameMap.get(userId) ?? '알 수 없음',
            maxRouteMeters,
            isLive: false,
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
    channel.on('broadcast', { event: 'progress' }, (msg) => {
      const { userId, displayName, maxRouteMeters } = msg.payload as {
        userId: string;
        displayName: string;
        maxRouteMeters: number;
      };
      runInAction(() => {
        const existing = this.rankings.find((r) => r.userId === userId);
        if (existing) {
          existing.maxRouteMeters = maxRouteMeters;
          if (existing.displayName === '알 수 없음') existing.displayName = displayName;
          existing.isLive = true;
        } else {
          this.rankings.push({ userId, displayName, maxRouteMeters, isLive: true });
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
