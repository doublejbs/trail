import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { haversineMeters, maxRouteProgress } from '../utils/routeProjection';
import type { Checkpoint } from '../types/checkpoint';

class TrackingStore {
  public isTracking: boolean = false;
  public points: { lat: number; lng: number; ts: number }[] = [];
  public saving: boolean = false;
  public saveError: string | null = null;
  public maxRouteMeters: number = 0;
  public distanceMeters: number = 0;
  public latestLat: number | null = null;
  public latestLng: number | null = null;
  public restoring: boolean = false;
  public startedAt: Date | null = null;
  public elapsedSeconds: number = 0;

  public displayName: string | null = null;
  public checkpoints: Checkpoint[] = [];
  public visitedCheckpointIds: Set<string> = new Set();
  public nearCheckpointId: string | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private _lastBroadcastLat: number | null = null;
  private _lastBroadcastLng: number | null = null;
  private _positionSaveTimerId: ReturnType<typeof setInterval> | null = null;
  private _userId: string | null = null;
  private _channel: ReturnType<typeof supabase.channel> | null = null;
  private _sessionId: string | null = null;
  private groupId: string;
  private routePoints: { lat: number; lng: number }[];

  public constructor(
    groupId: string,
    routePoints: { lat: number; lng: number }[]
  ) {
    this.groupId = groupId;
    this.routePoints = routePoints;
    makeAutoObservable(this);
  }

  public setRoutePoints(points: { lat: number; lng: number }[]): void {
    this.routePoints = points;
  }

  public setCheckpoints(checkpoints: Checkpoint[]): void {
    this.checkpoints = checkpoints;
  }

  public get formattedTime(): string {
    const h = Math.floor(this.elapsedSeconds / 3600);
    const m = Math.floor((this.elapsedSeconds % 3600) / 60);
    const s = this.elapsedSeconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  }

  /** 페이지 로드 시 active 세션 복원 */
  public async restore(): Promise<void> {
    runInAction(() => { this.restoring = true; });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('tracking_sessions')
        .select('id, status, max_route_meters, distance_meters, started_at')
        .eq('user_id', user.id)
        .eq('group_id', this.groupId)
        .in('status', ['active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return;

      const startedAt = data.started_at ? new Date(data.started_at) : null;

      runInAction(() => {
        this._sessionId = data.id;
        this._userId = user.id;
        this.isTracking = true;
        this.maxRouteMeters = Number(data.max_route_meters) || 0;
        this.distanceMeters = Number(data.distance_meters) || 0;
        this.startedAt = startedAt;
        if (startedAt) {
          this.elapsedSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
        }
      });

      this._startTimer();

      // 체크포인트 통과 상태 복원
      const { data: visits } = await supabase
        .from('checkpoint_visits')
        .select('checkpoint_id')
        .eq('tracking_session_id', data.id);

      if (visits && visits.length > 0) {
        runInAction(() => {
          this.visitedCheckpointIds = new Set(visits.map((v) => v.checkpoint_id));
        });
      }
    } catch {
      // 복원 실패 시 초기 상태 유지
    } finally {
      runInAction(() => { this.restoring = false; });
    }
  }

  public async start(): Promise<void> {
    if (this.isTracking) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const sessionId = crypto.randomUUID();
    const now = new Date();

    const { error } = await supabase.from('tracking_sessions').insert({
      id: sessionId,
      user_id: user.id,
      group_id: this.groupId,
      elapsed_seconds: 0,
      distance_meters: 0,
      points: [],
      max_route_meters: 0,
      status: 'active',
      started_at: now.toISOString(),
    });

    if (error) {
      toast.error('트래킹을 시작할 수 없습니다');
      return;
    }

    runInAction(() => {
      this._sessionId = sessionId;
      this._userId = user.id;
      this.isTracking = true;
      this.distanceMeters = 0;
      this.points = [];
      this.saveError = null;
      this.maxRouteMeters = 0;
      this.startedAt = now;
      this.elapsedSeconds = 0;
    });

    this._startTimer();
  }

  public async stop(): Promise<void> {
    this._clearTimer();
    if (!this._sessionId) {
      runInAction(() => { this.isTracking = false; });
      return;
    }

    runInAction(() => { this.saving = true; this.saveError = null; });

    try {
      const { error } = await supabase
        .from('tracking_sessions')
        .update({
          status: 'completed',
          elapsed_seconds: this.elapsedSeconds,
          distance_meters: this.distanceMeters,
          points: this.points,
          max_route_meters: this.maxRouteMeters,
        })
        .eq('id', this._sessionId);

      if (error) throw error;

      runInAction(() => {
        this.saving = false;
        this.isTracking = false;
        this._sessionId = null;
        this.startedAt = null;
        this.elapsedSeconds = 0;
      });
      toast.success('기록이 저장되었습니다');
    } catch (e) {
      runInAction(() => {
        this.saving = false;
        this.isTracking = false;
        this.saveError = e instanceof Error ? e.message : '저장 실패';
      });
      toast.error('기록 저장에 실패했습니다');
    }
  }

  public async restart(): Promise<void> {
    this._clearTimer();

    // sessionId가 있으면 해당 세션 종료
    if (this._sessionId) {
      await supabase
        .from('tracking_sessions')
        .update({ status: 'completed' })
        .eq('id', this._sessionId);
    }

    // sessionId 없이 복원된 경우 대비: 이 그룹의 모든 active 세션 종료
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('tracking_sessions')
        .update({ status: 'completed' })
        .eq('user_id', user.id)
        .eq('group_id', this.groupId)
        .in('status', ['active', 'paused']);
    }

    runInAction(() => {
      this.isTracking = false;
      this._sessionId = null;
      this.startedAt = null;
      this.elapsedSeconds = 0;
      this.distanceMeters = 0;
      this.maxRouteMeters = 0;
      this.points = [];
      this.latestLat = null;
      this.latestLng = null;
      this.saveError = null;
      this.visitedCheckpointIds = new Set();
      this.nearCheckpointId = null;
    });
  }

  public dispose(): void {
    this._clearTimer();
    if (this._positionSaveTimerId !== null) {
      clearInterval(this._positionSaveTimerId);
      this._positionSaveTimerId = null;
    }
    if (this._userId && this.latestLat !== null && this.latestLng !== null) {
      void supabase.from('group_member_positions').upsert({
        user_id: this._userId,
        group_id: this.groupId,
        lat: this.latestLat,
        lng: this.latestLng,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,group_id' });
    }
    if (this._channel) {
      void supabase.removeChannel(this._channel);
      runInAction(() => { this._channel = null; });
    }
  }

  public setLatestPosition(lat: number, lng: number): void {
    this.latestLat = lat;
    this.latestLng = lng;
    this._updateNearCheckpoint(lat, lng);
    this._maybeBroadcast(lat, lng);
  }

  public async startLocationBroadcast(): Promise<void> {
    if (this._channel) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      const channel = supabase.channel(`group-progress:${this.groupId}`);
      channel.subscribe();

      runInAction(() => {
        this._userId = user.id;
        this.displayName = profile?.display_name ?? user.email?.split('@')[0] ?? null;
        this._channel = channel;
      });
    } catch {
      // silent
      return;
    }

    runInAction(() => {
      this._positionSaveTimerId = setInterval(() => {
        if (this._userId && this.latestLat !== null && this.latestLng !== null) {
          void supabase.from('group_member_positions').upsert({
            user_id: this._userId!,
            group_id: this.groupId,
            lat: this.latestLat!,
            lng: this.latestLng!,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,group_id' });
        }
      }, 5000);
    });
  }

  private _maybeBroadcast(lat: number, lng: number): void {
    if (!this._channel || !this._userId) return;

    const MIN_DISTANCE_M = 5;
    if (this._lastBroadcastLat !== null && this._lastBroadcastLng !== null) {
      const dist = haversineMeters(this._lastBroadcastLat, this._lastBroadcastLng, lat, lng);
      if (dist < MIN_DISTANCE_M) return;
    }

    this._lastBroadcastLat = lat;
    this._lastBroadcastLng = lng;

    void this._channel.send({
      type: 'broadcast',
      event: 'progress',
      payload: {
        userId: this._userId,
        displayName: this.displayName,
        maxRouteMeters: this.maxRouteMeters,
        lat,
        lng,
        checkpointsVisited: this.visitedCheckpointIds.size,
      },
    });
  }

  public addPoint(lat: number, lng: number): void {
    if (!this.isTracking) return;
    const point = { lat, lng, ts: Date.now() };
    if (this.points.length > 0) {
      const prev = this.points[this.points.length - 1];
      const meters = haversineMeters(prev.lat, prev.lng, lat, lng);
      this.distanceMeters += meters;
    }
    this.points.push(point);
    this.latestLat = lat;
    this.latestLng = lng;
    this.maxRouteMeters = maxRouteProgress(this.points, this.routePoints);
    this._updateNearCheckpoint(lat, lng);
  }

  private _startTimer(): void {
    this._clearTimer();
    this.timerId = setInterval(() => {
      runInAction(() => {
        if (this.startedAt) {
          this.elapsedSeconds = Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
        }
      });
    }, 1000);
  }

  private _clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private _updateNearCheckpoint(lat: number, lng: number): void {
    let nearest: { id: string; dist: number } | null = null;
    for (const cp of this.checkpoints) {
      if (this.visitedCheckpointIds.has(cp.id)) continue;
      const dist = haversineMeters(lat, lng, cp.lat, cp.lng);
      if (dist <= cp.radius_m && (!nearest || dist < nearest.dist)) {
        nearest = { id: cp.id, dist };
      }
    }
    this.nearCheckpointId = nearest?.id ?? null;
  }

  public async visitCheckpoint(checkpointId: string): Promise<void> {
    if (this.nearCheckpointId !== checkpointId) return;
    if (!this._sessionId || !this._userId) return;
    if (this.visitedCheckpointIds.has(checkpointId)) return;

    const { error } = await supabase.from('checkpoint_visits').insert({
      user_id: this._userId,
      checkpoint_id: checkpointId,
      tracking_session_id: this._sessionId,
    });

    if (error) return;

    runInAction(() => {
      this.visitedCheckpointIds = new Set([...this.visitedCheckpointIds, checkpointId]);
      this.nearCheckpointId = null;
    });

    // 브로드캐스트에 체크포인트 수 포함하여 즉시 전송
    if (this._channel && this._userId && this.latestLat !== null && this.latestLng !== null) {
      void this._channel.send({
        type: 'broadcast',
        event: 'progress',
        payload: {
          userId: this._userId,
          displayName: this.displayName,
          maxRouteMeters: this.maxRouteMeters,
          lat: this.latestLat,
          lng: this.latestLng,
          checkpointsVisited: this.visitedCheckpointIds.size,
        },
      });
    }
  }

}

export { TrackingStore };
