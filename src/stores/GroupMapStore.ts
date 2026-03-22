import { makeAutoObservable, runInAction, computed } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

class GroupMapStore {
  private navigate: NavigateFunction;
  private groupId: string = '';
  public group: Group | null | undefined = undefined;
  public gpxText: string | null | undefined = undefined;
  public currentUserId: string | null = null;
  public periodStartedAt: Date | null = null;
  public periodEndedAt: Date | null = null;

  public get isPeriodActive(): boolean {
    return this.periodStartedAt !== null && this.periodEndedAt === null;
  }

  public constructor(navigate: NavigateFunction) {
    this.navigate = navigate;
    makeAutoObservable(this, { isPeriodActive: computed });
  }

  public load(groupId: string): () => void {
    this.groupId = groupId;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (cancelled) return;

      if (error || !data) {
        runInAction(() => { this.group = null; });
        this.navigate('/group', { replace: true });
        return;
      }

      const [{ data: userData }, { data: urlData, error: urlError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.storage.from((data as Group).gpx_bucket ?? 'gpx-files').createSignedUrl((data as Group).gpx_path, 3600),
      ]);

      if (cancelled) return;

      runInAction(() => {
        this.group = data as Group;
        this.currentUserId = userData?.user?.id ?? null;
        this.periodStartedAt = (data as Group).period_started_at
          ? new Date((data as Group).period_started_at!)
          : null;
        this.periodEndedAt = (data as Group).period_ended_at
          ? new Date((data as Group).period_ended_at!)
          : null;
      });

      if (urlError || !urlData?.signedUrl) {
        runInAction(() => { this.gpxText = null; });
        return;
      }

      try {
        const response = await fetch(urlData.signedUrl);
        if (!response.ok) throw new Error('GPX fetch failed');
        const text = await response.text();
        if (!cancelled) runInAction(() => { this.gpxText = text; });
      } catch {
        if (!cancelled) runInAction(() => { this.gpxText = null; });
      }
    })();

    return () => { cancelled = true; };
  }

  public async startPeriod(): Promise<void> {
    const now = new Date();
    const { error } = await supabase
      .from('groups')
      .update({ period_started_at: now.toISOString(), period_ended_at: null })
      .eq('id', this.groupId);
    if (!error) {
      runInAction(() => {
        this.periodStartedAt = now;
        this.periodEndedAt = null;
      });
    }
  }

  public async endPeriod(): Promise<void> {
    const now = new Date();
    const { error } = await supabase
      .from('groups')
      .update({ period_ended_at: now.toISOString() })
      .eq('id', this.groupId);
    if (!error) {
      runInAction(() => { this.periodEndedAt = now; });
    }
  }
}

export { GroupMapStore };
