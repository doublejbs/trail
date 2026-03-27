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

  public subscribeToPeriodEvents(isAdmin: boolean = false): () => void {
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

    // 폴링: 관리자가 아닌 경우에만 5초마다 그룹 상태 확인
    const pollId = isAdmin ? null : setInterval(() => { void this._pollPeriodStatus(); }, 5000);

    return () => {
      if (pollId) clearInterval(pollId);
      if (this._periodChannel) {
        void supabase.removeChannel(this._periodChannel);
        this._periodChannel = null;
      }
    };
  }

  private async _pollPeriodStatus(): Promise<void> {
    const { data } = await supabase
      .from('groups')
      .select('period_started_at, period_ended_at')
      .eq('id', this.groupId)
      .single();
    if (!data) return;

    const newStarted = data.period_started_at ? new Date(data.period_started_at) : null;
    const newEnded = data.period_ended_at ? new Date(data.period_ended_at) : null;

    const wasActive = this.isPeriodActive;

    runInAction(() => {
      this.periodStartedAt = newStarted;
      this.periodEndedAt = newEnded;
    });

    // 활동 중 → 종료 전환 감지
    if (wasActive && newEnded) {
      toast('활동이 종료되었습니다');
    }
    // 비활성 → 활동 시작 전환 감지
    if (!wasActive && newStarted && !newEnded) {
      toast('활동이 시작되었습니다');
    }
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
      // 해당 그룹의 모든 active/paused 세션을 completed로 변경
      await supabase
        .from('tracking_sessions')
        .update({ status: 'completed' })
        .eq('group_id', this.groupId)
        .in('status', ['active', 'paused']);

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
