import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock';
import { haversineMeters, maxRouteProgress, totalRouteDistance } from '../utils/routeProjection';
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

  public isFinished: boolean = false;
  public checkpoints: Checkpoint[] = [];
  public visitedCheckpointIds: Set<string> = new Set();
  public nearCheckpointId: string | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private _userId: string | null = null;
  private _sessionId: string | null = null;
  private _onCheckpointVisited: (() => void) | null = null;
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
      acquireWakeLock();

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
      this.visitedCheckpointIds = new Set();
      this.nearCheckpointId = null;
      this.isFinished = false;
    });

    this._startTimer();
    acquireWakeLock();
  }

  public async stop(): Promise<void> {
    this._clearTimer();
    releaseWakeLock();
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
    releaseWakeLock();

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
    releaseWakeLock();
  }

  public setLatestPosition(lat: number, lng: number): void {
    this.latestLat = lat;
    this.latestLng = lng;
    this._updateNearCheckpoint(lat, lng);
  }

  public setOnCheckpointVisited(cb: (() => void) | null): void {
    this._onCheckpointVisited = cb;
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
    if (this.visitedCheckpointIds.has(checkpointId)) return;
    if (!this._sessionId || !this._userId || !this.isTracking) {
      toast('트래킹을 시작해야 체크포인트를 인증할 수 있습니다');
      return;
    }

    // 탭 시점에 실제 거리로 재확인
    const cp = this.checkpoints.find((c) => c.id === checkpointId);
    if (!cp || this.latestLat === null || this.latestLng === null) return;

    // 경로상에서 체크포인트를 이미 지나쳤는지 확인
    const cpRouteMeters = maxRouteProgress([{ lat: cp.lat, lng: cp.lng }], this.routePoints);
    const alreadyPassed = this.routePoints.length >= 2 && cpRouteMeters > 0 && this.maxRouteMeters >= cpRouteMeters;

    if (!alreadyPassed) {
      const dist = haversineMeters(this.latestLat, this.latestLng, cp.lat, cp.lng);
      if (dist > cp.radius_m) {
        toast(`체크포인트 반경 안에 들어와야 인증할 수 있습니다 (${Math.round(dist)}m/${cp.radius_m}m)`);
        return;
      }
    }

    const { error } = await supabase.from('checkpoint_visits').insert({
      user_id: this._userId,
      checkpoint_id: checkpointId,
      tracking_session_id: this._sessionId,
    });

    if (error) return;

    const checkpoint = this.checkpoints.find((cp) => cp.id === checkpointId);

    runInAction(() => {
      this.visitedCheckpointIds = new Set([...this.visitedCheckpointIds, checkpointId]);
      this.nearCheckpointId = null;
    });

    this._onCheckpointVisited?.();

    // 종료 체크포인트 통과 시 트래킹 완료
    if (checkpoint?.is_finish) {
      runInAction(() => {
        this.maxRouteMeters = totalRouteDistance(this.routePoints);
      });
      runInAction(() => { this.isFinished = true; });
      await this.stop();
    }
  }

}

export { TrackingStore };
