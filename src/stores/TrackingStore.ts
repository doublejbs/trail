import { makeAutoObservable, runInAction } from 'mobx';

class TrackingStore {
  public isTracking: boolean = false;
  public elapsedSeconds: number = 0;
  public distanceMeters: number = 0;
  public speedKmh: number = 0;
  public points: { lat: number; lng: number; ts: number }[] = [];

  private timerId: ReturnType<typeof setInterval> | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public start(): void {
    this._clearTimer();
    runInAction(() => {
      this.isTracking = true;
      this.elapsedSeconds = 0;
      this.distanceMeters = 0;
      this.speedKmh = 0;
      this.points = [];
    });
    this.timerId = setInterval(() => {
      runInAction(() => { this.elapsedSeconds += 1; });
    }, 1000);
  }

  public stop(): void {
    this._clearTimer();
    runInAction(() => { this.isTracking = false; });
  }

  public dispose(): void {
    this._clearTimer();
  }

  private _clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

export { TrackingStore };
