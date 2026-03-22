import { makeAutoObservable, runInAction, computed } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
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

  private _periodChannel: ReturnType<typeof supabase.channel> | null = null;

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

  public subscribeToPeriodEvents(): () => void {
    const channel = supabase.channel(`group-period:${this.groupId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on('broadcast', { event: 'period_started' }, (msg) => {
      const { startedAt } = msg.payload as { startedAt: string };
      runInAction(() => {
        this.periodStartedAt = new Date(startedAt);
        this.periodEndedAt = null;
      });
      toast('활동이 시작되었습니다');
    });
    channel.on('broadcast', { event: 'period_ended' }, () => {
      runInAction(() => { this.periodEndedAt = new Date(); });
      toast('활동이 종료되었습니다');
    });
    channel.subscribe();
    this._periodChannel = channel;
    return () => {
      if (this._periodChannel) {
        void supabase.removeChannel(this._periodChannel);
        this._periodChannel = null;
      }
    };
  }

  public async startPeriod(): Promise<void> {
    const now = new Date();
    const { error } = await supabase
      .from('groups')
      .update({ period_started_at: now.toISOString(), period_ended_at: null })
      .eq('id', this.groupId);
    if (error) {
      toast.error(`활동 시작 실패: ${error.message}`);
      return;
    }
    runInAction(() => {
      this.periodStartedAt = now;
      this.periodEndedAt = null;
    });
    if (this._periodChannel) {
      void this._periodChannel.send({
        type: 'broadcast',
        event: 'period_started',
        payload: { startedAt: now.toISOString() },
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
      if (this._periodChannel) {
        void this._periodChannel.send({
          type: 'broadcast',
          event: 'period_ended',
          payload: {},
        });
      }
    }
  }
}

export { GroupMapStore };
