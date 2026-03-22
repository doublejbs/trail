import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';

interface HistorySession {
  id: string;
  groupId: string;
  groupName: string;
  elapsedSeconds: number;
  distanceMeters: number;
  maxRouteMeters: number;
  createdAt: string;
}

class HistoryStore {
  public sessions: HistorySession[] = [];
  public loading: boolean = false;
  public error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async load(): Promise<void> {
    runInAction(() => { this.loading = true; this.error = null; });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('인증되지 않은 사용자');

      const { data, error } = await supabase
        .from('tracking_sessions')
        .select('id, group_id, elapsed_seconds, distance_meters, max_route_meters, created_at, groups(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      runInAction(() => {
        this.sessions = (data ?? []).map((row) => ({
          id: row.id,
          groupId: row.group_id,
          groupName: (row.groups as unknown as { name: string } | null)?.name ?? '알 수 없는 그룹',
          elapsedSeconds: row.elapsed_seconds ?? 0,
          distanceMeters: row.distance_meters ?? 0,
          maxRouteMeters: row.max_route_meters ?? 0,
          createdAt: row.created_at,
        }));
        this.loading = false;
      });
    } catch (e) {
      runInAction(() => {
        this.error = e instanceof Error ? e.message : '기록을 불러오지 못했습니다';
        this.loading = false;
      });
    }
  }
}

export { HistoryStore };
export type { HistorySession };
