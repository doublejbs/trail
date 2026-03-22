import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

class TrackingStore {
  public isTracking: boolean = false;
  public elapsedSeconds: number = 0;
  public distanceMeters: number = 0;
  public speedKmh: number = 0;
  public points: { lat: number; lng: number; ts: number }[] = [];
  public saving: boolean = false;
  public saveError: string | null = null;

  private timerId: ReturnType<typeof setInterval> | null = null;
  private groupId: string;

  constructor(groupId: string) {
    this.groupId = groupId;
    makeAutoObservable(this);
  }

  public start(): void {
    this._clearTimer();
    this.isTracking = true;
    this.elapsedSeconds = 0;
    this.distanceMeters = 0;
    this.speedKmh = 0;
    this.points = [];
    this.saveError = null;
    this.timerId = setInterval(() => {
      runInAction(() => { this.elapsedSeconds += 1; });
    }, 1000);
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

  private async _save(): Promise<void> {
    runInAction(() => { this.saving = true; this.saveError = null; });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('인증되지 않은 사용자');
      const { error } = await supabase.from('tracking_sessions').insert({
        user_id:         user.id,
        group_id:        this.groupId,
        elapsed_seconds: this.elapsedSeconds,
        distance_meters: this.distanceMeters,
        points:          this.points,
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
