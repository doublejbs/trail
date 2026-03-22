import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { haversineMeters, maxRouteProgress } from '../utils/routeProjection';

class TrackingStore {
  public isTracking: boolean = false;
  public elapsedSeconds: number = 0;
  public distanceMeters: number = 0;
  public speedKmh: number = 0;
  public points: { lat: number; lng: number; ts: number }[] = [];
  public saving: boolean = false;
  public saveError: string | null = null;
  public maxRouteMeters: number = 0;
  public latestLat: number | null = null;
  public latestLng: number | null = null;

  private timerId: ReturnType<typeof setInterval> | null = null;
  private _userId: string | null = null;
  private _displayName: string | null = null;
  private _channel: ReturnType<typeof supabase.channel> | null = null;
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

  public start(): void {
    this._clearTimer();
    this.isTracking = true;
    this.elapsedSeconds = 0;
    this.distanceMeters = 0;
    this.speedKmh = 0;
    this.points = [];
    this.saveError = null;
    this.maxRouteMeters = 0;
    this.timerId = setInterval(() => {
      runInAction(() => { this.elapsedSeconds += 1; });
      if (this._channel && this._userId) {
        void this._channel.send({
          type: 'broadcast',
          event: 'progress',
          payload: {
            userId: this._userId,
            displayName: this._displayName,
            maxRouteMeters: this.maxRouteMeters,
            lat: this.latestLat,
            lng: this.latestLng,
          },
        });
      }
    }, 1000);
    void this._initBroadcast();
  }

  public stop(): void {
    this._clearTimer();
    this.isTracking = false;
    if (this.elapsedSeconds > 0) {
      void this._save();
    }
  }

  public dispose(): void {
    this._clearTimer();
    if (this._channel) {
      void supabase.removeChannel(this._channel);
      runInAction(() => { this._channel = null; });
    }
  }

  public addPoint(lat: number, lng: number): void {
    if (!this.isTracking) return;
    const point = { lat, lng, ts: Date.now() };
    if (this.points.length > 0) {
      const prev = this.points[this.points.length - 1];
      const meters = haversineMeters(prev.lat, prev.lng, lat, lng);
      this.distanceMeters += meters;
      const dtHours = (point.ts - prev.ts) / 3_600_000;
      this.speedKmh = dtHours > 0 ? (meters / 1000) / dtHours : 0;
    }
    this.points.push(point);
    this.latestLat = lat;
    this.latestLng = lng;
    this.maxRouteMeters = maxRouteProgress(this.points, this.routePoints);
  }

  public get formattedTime(): string {
    const h = Math.floor(this.elapsedSeconds / 3600);
    const m = Math.floor((this.elapsedSeconds % 3600) / 60);
    const s = this.elapsedSeconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  }

  public get formattedDistance(): string {
    if (this.distanceMeters < 1000) {
      return `${Math.round(this.distanceMeters)}m`;
    }
    return `${(this.distanceMeters / 1000).toFixed(1)}km`;
  }

  public get formattedSpeed(): string {
    return `${this.speedKmh.toFixed(1)}km/h`;
  }

  private async _initBroadcast(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
      runInAction(() => {
        this._userId = user.id;
        this._displayName = profile?.display_name ?? user.email?.split('@')[0] ?? null;
        this._channel = supabase.channel(`group-progress:${this.groupId}`);
        this._channel.subscribe();
      });
    } catch {
      // broadcast 실패 시 silent — tracking 자체는 계속
    }
  }

  private async _save(): Promise<void> {
    runInAction(() => { this.saving = true; this.saveError = null; });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('인증되지 않은 사용자');
      const { error } = await supabase.from('tracking_sessions').insert({
        user_id:          user.id,
        group_id:         this.groupId,
        elapsed_seconds:  this.elapsedSeconds,
        distance_meters:  this.distanceMeters,
        points:           this.points,
        max_route_meters: this.maxRouteMeters,
      });
      if (error) throw error;
      runInAction(() => { this.saving = false; });
      toast.success('기록이 저장되었습니다');
    } catch (e) {
      runInAction(() => {
        this.saving = false;
        this.saveError = e instanceof Error ? e.message : '저장 실패';
      });
      toast.error('기록 저장에 실패했습니다');
    }
  }

  private _clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

export { TrackingStore };
