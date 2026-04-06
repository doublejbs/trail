import { makeAutoObservable, runInAction, reaction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { parseGpxCoords } from '../../lib/gpx';
import { parseGpxPoints } from '../../utils/routeProjection';
import { MapStore } from '../MapStore';
import { MapRenderingStore } from '../MapRenderingStore';
import { MemberMarkerStore } from '../MemberMarkerStore';
import { GroupMapStore } from '../GroupMapStore';
import { TrackingStore } from '../TrackingStore';
import { TrackingBroadcastStore } from '../TrackingBroadcastStore';
import { LeaderboardStore } from '../LeaderboardStore';
import type { Checkpoint } from '../../types/checkpoint';

class GroupMapUIStore {
  // UI state
  public activeTab: 'map' | 'leaderboard' = 'map';
  public showElevation: boolean = false;
  public showRestartConfirm: boolean = false;
  public showCountdown: boolean = false;
  public starting: boolean = false;
  public resetting: boolean = false;

  // Data state
  public checkpoints: Checkpoint[] = [];
  public totalCheckpoints: number = 0;

  // Sub-stores
  public mapStore: MapStore;
  public renderingStore: MapRenderingStore;
  public memberMarkerStore: MemberMarkerStore;
  public groupMapStore: GroupMapStore;
  public trackingStore: TrackingStore;
  public broadcastStore: TrackingBroadcastStore;
  public leaderboardStore: LeaderboardStore;

  private _periodDisposers: (() => void)[] = [];

  public constructor(groupId: string, navigate: NavigateFunction) {
    this.mapStore = new MapStore();
    this.renderingStore = new MapRenderingStore(() => this.mapStore.map);
    this.memberMarkerStore = new MemberMarkerStore(() => this.mapStore.map);
    this.groupMapStore = new GroupMapStore(navigate);
    this.trackingStore = new TrackingStore(groupId, []);
    this.broadcastStore = new TrackingBroadcastStore(groupId, this.trackingStore);
    this.leaderboardStore = new LeaderboardStore(groupId);

    makeAutoObservable(this);
  }

  public get routePoints(): { lat: number; lng: number }[] {
    return this.groupMapStore.gpxText ? parseGpxPoints(this.groupMapStore.gpxText) : [];
  }

  // UI actions
  public setActiveTab(tab: 'map' | 'leaderboard'): void {
    this.activeTab = tab;
  }

  public toggleLeaderboard(): void {
    this.activeTab = this.activeTab === 'leaderboard' ? 'map' : 'leaderboard';
  }

  public toggleElevation(): void {
    this.showElevation = !this.showElevation;
    this.activeTab = 'map';
  }

  public openRestartConfirm(): void {
    this.showRestartConfirm = true;
  }

  public closeRestartConfirm(): void {
    this.showRestartConfirm = false;
  }

  public openCountdown(): void {
    this.showCountdown = true;
  }

  public async handleCountdownComplete(): Promise<void> {
    runInAction(() => { this.starting = true; });
    try {
      await this.trackingStore.start();
    } finally {
      runInAction(() => {
        this.starting = false;
        this.showCountdown = false;
      });
    }
  }

  public async handleRestart(): Promise<void> {
    runInAction(() => {
      this.showRestartConfirm = false;
      this.resetting = true;
    });
    try {
      await this.trackingStore.restart();
    } finally {
      runInAction(() => { this.resetting = false; });
    }
  }

  // Init methods
  public async loadAvatarUrl(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_path')
      .eq('id', user.id)
      .single();
    if (!profile?.avatar_path) return;
    const { data: signed } = await supabase.storage
      .from('avatars')
      .createSignedUrl(profile.avatar_path, 3600);
    if (signed?.signedUrl) this.mapStore.setLocationAvatarUrl(signed.signedUrl);
  }

  public initMap(el: HTMLDivElement): void {
    this.mapStore.initMap(el);
    this.mapStore.startWatchingLocation((lat, lng) => {
      this.trackingStore.setLatestPosition(lat, lng);
      this.trackingStore.addPoint(lat, lng);
      this.broadcastStore.broadcast(lat, lng);
    });
    void this.broadcastStore.start();
    this.renderingStore.setOnCheckpointTap((cpId) => {
      void this.trackingStore.visitCheckpoint(cpId);
    });
    this.trackingStore.setOnCheckpointVisited(() => {
      this.broadcastStore.broadcastImmediate();
    });
  }

  public drawRoute(): void {
    if (this.groupMapStore.gpxText === undefined || !this.mapStore.map) return;
    if (this.groupMapStore.gpxText === null) {
      runInAction(() => { this.mapStore.error = true; });
      return;
    }
    const firstCoord = parseGpxCoords(this.groupMapStore.gpxText)?.[0];
    if (firstCoord) {
      this.mapStore.map.setCenter(new window.naver.maps.LatLng(firstCoord.lat, firstCoord.lon));
    }
    this.renderingStore.drawGpxRoute(this.groupMapStore.gpxText);
  }

  public async initAfterLoad(groupId: string): Promise<void> {
    // Set route points on tracking store
    if (this.routePoints.length > 0) {
      this.trackingStore.setRoutePoints(this.routePoints);
    }

    void this.trackingStore.restore();

    // Load checkpoints
    const { data } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order', { ascending: true });

    const cps = (data ?? []) as Checkpoint[];
    runInAction(() => {
      this.checkpoints = cps;
      this.totalCheckpoints = cps.length;
    });
    this.trackingStore.setCheckpoints(cps);

    void this.leaderboardStore.load(this.groupMapStore.periodStartedAt ?? null);

    const admin = this.groupMapStore.currentUserId === this.groupMapStore.group?.created_by;
    const unsubscribe = this.groupMapStore.subscribeToPeriodEvents(admin);

    const disposerEnd = reaction(
      () => this.groupMapStore.periodEndedAt,
      (endedAt) => {
        void this.leaderboardStore.load(this.groupMapStore.periodStartedAt);
        if (endedAt && this.trackingStore.isTracking) {
          void this.trackingStore.stop();
        }
      },
    );
    const disposerStart = reaction(
      () => this.groupMapStore.periodStartedAt,
      (startedAt) => { void this.leaderboardStore.load(startedAt); },
    );

    this._periodDisposers = [unsubscribe, disposerEnd, disposerStart];
  }

  public dispose(): void {
    this.mapStore.destroy();
    this.renderingStore.destroy();
    this.memberMarkerStore.clearAll();
    this.trackingStore.dispose();
    this.broadcastStore.dispose();
    this.leaderboardStore.dispose();
    this._periodDisposers.forEach((d) => d());
    this._periodDisposers = [];
  }
}

export { GroupMapUIStore };
