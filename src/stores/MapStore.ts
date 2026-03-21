import { makeAutoObservable, observable, runInAction } from "mobx";

function createPinHtml(color: string): string {
  return `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid white;"></div>`;
}

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;
  public gpxPolyline: naver.maps.Polyline | null = null;
  public startMarker: naver.maps.Marker | null = null;
  public endMarker: naver.maps.Marker | null = null;
  public locationMarker: naver.maps.Marker | null = null;
  public isCourseVisible: boolean = true;
  private gpxBounds: naver.maps.LatLngBounds | null = null;
  private idleListener: naver.maps.MapEventListener | null = null;

  private watchId: number | null = null;

  public constructor() {
    makeAutoObservable(this, {
      map: observable.ref,
      gpxPolyline: observable.ref,
      startMarker: observable.ref,
      endMarker: observable.ref,
      locationMarker: observable.ref,
    });
  }

  public initMap(el: HTMLDivElement): void {
    if (this.map) return;

    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
    if (!clientId) {
      console.warn("VITE_NAVER_MAP_CLIENT_ID is not set");
      this.error = true;
      return;
    }

    if (!window.naver?.maps?.Map) {
      console.error(
        "Naver Maps SDK not loaded — check script tag and API key authorization for this domain",
      );
      this.error = true;
      return;
    }

    (window as Window & { navermap_authFailure?: () => void }).navermap_authFailure = () => {
      console.error("Naver Maps auth failed — check API key and authorized domains in NCP console");
      runInAction(() => { this.error = true; });
    };

    try {
      const instance = new window.naver.maps.Map(el, {
        center: new window.naver.maps.LatLng(37.5665, 126.978),
        zoom: 14,
      });
      this.map = instance;
    } catch (e) {
      console.error("Naver Maps init failed:", e);
      this.error = true;
    }
  }

  public drawGpxRoute(gpxText: string): void {
    if (!this.map) {
      this.error = true;
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxText, 'application/xml');

    if (doc.querySelector('parsererror')) {
      this.error = true;
      return;
    }

    const trkpts = Array.from(doc.getElementsByTagName('trkpt'));

    if (trkpts.length === 0) {
      this.error = true;
      return;
    }

    const path = trkpts
      .filter((pt) => {
        const lat = parseFloat(pt.getAttribute('lat') ?? '');
        const lon = parseFloat(pt.getAttribute('lon') ?? '');
        return !isNaN(lat) && !isNaN(lon);
      })
      .map((pt) =>
        new window.naver.maps.LatLng(
          parseFloat(pt.getAttribute('lat')!),
          parseFloat(pt.getAttribute('lon')!),
        ),
      );

    if (path.length === 0) {
      this.error = true;
      return;
    }

    const polyline = new window.naver.maps.Polyline({
      map: this.map,
      path,
      strokeColor: '#FF5722',
      strokeWeight: 4,
      strokeOpacity: 0.8,
    });

    this.map.setCenter(path[0]);

    // 이전 경로/마커 정리 (재호출 시 leak 방지)
    this.gpxPolyline?.setMap(null);
    this.startMarker?.setMap(null);
    this.startMarker = null;
    this.endMarker?.setMap(null);
    this.endMarker = null;

    // gpxBounds 계산
    const bounds = path.reduce(
      (b, pt) => b.extend(pt),
      new window.naver.maps.LatLngBounds(path[0], path[0]),
    );
    this.gpxBounds = bounds;

    // 기존 idle 리스너 정리 후 재등록
    if (this.idleListener) {
      window.naver.maps.Event.removeListener(this.idleListener);
    }
    this.idleListener = window.naver.maps.Event.addListener(
      this.map,
      'idle',
      () => {
        if (!this.map || !this.gpxBounds) return;
        const mapBounds = this.map.getBounds();
        if (!mapBounds || typeof (mapBounds as naver.maps.LatLngBounds).intersects !== 'function') return;
        runInAction(() => {
          this.isCourseVisible = (mapBounds as naver.maps.LatLngBounds).intersects(this.gpxBounds!);
        });
      },
    );

    this.gpxPolyline = polyline;

    this.startMarker = new window.naver.maps.Marker({
      map: this.map,
      position: path[0],
      icon: {
        content: createPinHtml('#4CAF50'),
        anchor: new window.naver.maps.Point(10, 20),
      },
    });

    if (path.length > 1) {
      this.endMarker = new window.naver.maps.Marker({
        map: this.map,
        position: path[path.length - 1],
        icon: {
          content: createPinHtml('#F44336'),
          anchor: new window.naver.maps.Point(10, 20),
        },
      });
    }
  }

  public clearGpxRoute(): void {
    if (this.idleListener) {
      window.naver.maps.Event.removeListener(this.idleListener);
      this.idleListener = null;
    }
    this.gpxBounds = null;
    this.isCourseVisible = true;
    this.gpxPolyline?.setMap(null);
    this.gpxPolyline = null;
    this.startMarker?.setMap(null);
    this.startMarker = null;
    this.endMarker?.setMap(null);
    this.endMarker = null;
  }

  public destroy(): void {
    this.stopWatchingLocation();
    this.clearGpxRoute();
    this.map?.destroy();
    this.map = null;
  }

  public locate(): void {
    if (!this.map || !navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      this.map!.setCenter(new window.naver.maps.LatLng(latitude, longitude));
    });
  }

  public stopWatchingLocation(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.locationMarker?.setMap(null);
    this.locationMarker = null;
  }

  public startWatchingLocation(): void {
    if (!this.map) return;
    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!this.map) return;
        const { latitude, longitude } = pos.coords;
        const latLng = new window.naver.maps.LatLng(latitude, longitude);

        runInAction(() => {
          if (!this.locationMarker) {
            this.locationMarker = new window.naver.maps.Marker({
              map: this.map!,
              position: latLng,
              icon: {
                content: '<div style="width:14px;height:14px;border-radius:50%;background:#4A90D9;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
                anchor: new window.naver.maps.Point(7, 7),
              },
            });
          } else {
            this.locationMarker.setPosition(latLng);
          }
        });
      },
      () => { /* 에러 무시 */ },
    );
  }
}

export { MapStore };
