import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import { haversineMeters } from '../utils/routeProjection';
import type { TrackingStore } from './TrackingStore';

class TrackingBroadcastStore {
  public displayName: string | null = null;
  private _channel: ReturnType<typeof supabase.channel> | null = null;
  private _userId: string | null = null;
  private _lastBroadcastLat: number | null = null;
  private _lastBroadcastLng: number | null = null;
  private _positionSaveTimerId: ReturnType<typeof setInterval> | null = null;
  private groupId: string;
  private trackingStore: TrackingStore;

  public constructor(groupId: string, trackingStore: TrackingStore) {
    this.groupId = groupId;
    this.trackingStore = trackingStore;
    makeAutoObservable(this);
  }

  public get userId(): string | null {
    return this._userId;
  }

  // Replaces TrackingStore.startLocationBroadcast()
  public async start(): Promise<void> {
    if (this._channel) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      const channel = supabase.channel(`group-progress:${this.groupId}`, {
        config: { broadcast: { self: true } },
      });
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve();
        });
      });

      runInAction(() => {
        this._userId = user.id;
        this.displayName = profile?.display_name ?? user.email?.split('@')[0] ?? null;
        this._channel = channel;
      });
    } catch {
      return;
    }

    const lat = this.trackingStore.latestLat;
    const lng = this.trackingStore.latestLng;
    if (this._userId && lat !== null && lng !== null) {
      void supabase.from('group_member_positions').upsert({
        user_id: this._userId,
        group_id: this.groupId,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,group_id' });
      this.broadcast(lat, lng);
    }

    runInAction(() => {
      this._positionSaveTimerId = setInterval(() => {
        const curLat = this.trackingStore.latestLat;
        const curLng = this.trackingStore.latestLng;
        if (this._userId && curLat !== null && curLng !== null) {
          void supabase.from('group_member_positions').upsert({
            user_id: this._userId,
            group_id: this.groupId,
            lat: curLat,
            lng: curLng,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,group_id' });
        }
      }, 5000);
    });
  }

  // Replaces TrackingStore._maybeBroadcast()
  public broadcast(lat: number, lng: number): void {
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
        maxRouteMeters: this.trackingStore.maxRouteMeters,
        lat,
        lng,
        checkpointsVisited: this.trackingStore.visitedCheckpointIds.size,
      },
    });
  }

  // Force broadcast (used after checkpoint visit)
  public broadcastImmediate(): void {
    const lat = this.trackingStore.latestLat;
    const lng = this.trackingStore.latestLng;
    if (lat !== null && lng !== null) {
      this._lastBroadcastLat = null;
      this._lastBroadcastLng = null;
      this.broadcast(lat, lng);
    }
  }

  // Replaces broadcast-related cleanup in TrackingStore.dispose()
  public dispose(): void {
    if (this._positionSaveTimerId !== null) {
      clearInterval(this._positionSaveTimerId);
      this._positionSaveTimerId = null;
    }
    const lat = this.trackingStore.latestLat;
    const lng = this.trackingStore.latestLng;
    if (this._userId && lat !== null && lng !== null) {
      void supabase.from('group_member_positions').upsert({
        user_id: this._userId,
        group_id: this.groupId,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,group_id' });
    }
    if (this._channel) {
      void supabase.removeChannel(this._channel);
      runInAction(() => { this._channel = null; });
    }
  }
}

export { TrackingBroadcastStore };
