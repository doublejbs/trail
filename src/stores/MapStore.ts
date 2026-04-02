import { makeAutoObservable, observable, runInAction } from "mobx";

function createPinHtml(color: string): string {
  return `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid white;"></div>`;
}

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;
  public gpxPolyline: naver.maps.Polyline | null = null;
  private _extraPolylines: naver.maps.Polyline[] = [];
  public startMarker: naver.maps.Marker | null = null;
  public endMarker: naver.maps.Marker | null = null;
  public locationMarker: naver.maps.Marker | null = null;
  public isCourseVisible: boolean = true;
  private gpxBounds: naver.maps.LatLngBounds | null = null;
  private idleListener: naver.maps.MapEventListener | null = null;

  private watchId: number | null = null;
  private lastPosition: { latitude: number; longitude: number } | null = null;
  private _memberMarkers: Map<string, naver.maps.Marker> = new Map();

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

    const allPoints = trkpts
      .filter((pt) => {
        const lat = parseFloat(pt.getAttribute('lat') ?? '');
        const lon = parseFloat(pt.getAttribute('lon') ?? '');
        return !isNaN(lat) && !isNaN(lon);
      })
      .map((pt) => ({
        lat: parseFloat(pt.getAttribute('lat')!),
        lon: parseFloat(pt.getAttribute('lon')!),
      }));

    if (allPoints.length === 0) {
      this.error = true;
      return;
    }

    // 이전 경로/마커 정리 (재호출 시 leak 방지)
    this.gpxPolyline?.setMap(null);
    this._extraPolylines.forEach((p) => p.setMap(null));
    this._extraPolylines = [];
    this.startMarker?.setMap(null);
    this.startMarker = null;
    this.endMarker?.setMap(null);
    this.endMarker = null;

    // 포인트 간 150m 이상 간격이면 세그먼트 분리 (트레일 구간 분리)
    const GAP_THRESHOLD = 150;
    const segments: naver.maps.LatLng[][] = [[]];
    for (let i = 0; i < allPoints.length; i++) {
      const pt = new window.naver.maps.LatLng(allPoints[i].lat, allPoints[i].lon);
      if (i > 0) {
        const prev = allPoints[i - 1];
        const dlat = allPoints[i].lat - prev.lat;
        const dlon = allPoints[i].lon - prev.lon;
        // 빠른 근사 거리 (정확한 haversine 대신)
        const approxM = Math.sqrt(dlat * dlat + dlon * dlon) * 111_000;
        if (approxM > GAP_THRESHOLD) {
          segments.push([]);
        }
      }
      segments[segments.length - 1].push(pt);
    }

    // 각 세그먼트를 별도 폴리라인으로 그리기
    const polylines: naver.maps.Polyline[] = [];
    for (const seg of segments) {
      if (seg.length < 2) continue;
      polylines.push(new window.naver.maps.Polyline({
        map: this.map,
        path: seg,
        strokeColor: '#FF5722',
        strokeWeight: 4,
        strokeOpacity: 0.8,
      }));
    }

    // 첫 번째를 gpxPolyline으로, 나머지를 _extraPolylines로
    const allPts = segments.flat();
    if (polylines.length > 0) {
      this.gpxPolyline = polylines[0];
      this._extraPolylines = polylines.slice(1);
    }

    // gpxBounds 계산
    const bounds = allPts.reduce(
      (b, pt) => b.extend(pt),
      new window.naver.maps.LatLngBounds(allPts[0], allPts[0]),
    );
    this.gpxBounds = bounds;

    this.map.setCenter(allPts[0]);

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

    this.startMarker = new window.naver.maps.Marker({
      map: this.map,
      position: allPts[0],
      icon: {
        content: createPinHtml('#4CAF50'),
        anchor: new window.naver.maps.Point(10, 20),
      },
    });

    if (allPts.length > 1) {
      this.endMarker = new window.naver.maps.Marker({
        map: this.map,
        position: allPts[allPts.length - 1],
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
    this._extraPolylines.forEach((p) => p.setMap(null));
    this._extraPolylines = [];
    this.startMarker?.setMap(null);
    this.startMarker = null;
    this.endMarker?.setMap(null);
    this.endMarker = null;
  }

  public updateMemberMarker(userId: string, displayName: string, lat: number, lng: number): void {
    if (!this.map) return;
    const latLng = new window.naver.maps.LatLng(lat, lng);
    const existing = this._memberMarkers.get(userId);
    if (existing) {
      existing.setPosition(latLng);
    } else {
      const initial = displayName.charAt(0).toUpperCase() || '?';
      const marker = new window.naver.maps.Marker({
        map: this.map,
        position: latLng,
        icon: {
          content: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><div style="background:#FF6B35;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)">${initial}</div><div style="background:rgba(0,0,0,0.7);color:white;border-radius:4px;padding:1px 4px;font-size:10px;white-space:nowrap;max-width:60px;overflow:hidden;text-overflow:ellipsis">${displayName}</div></div>`,
          anchor: new window.naver.maps.Point(14, 14),
        },
      });
      this._memberMarkers.set(userId, marker);
    }
  }

  public clearMemberMarkers(): void {
    this._memberMarkers.forEach((marker) => marker.setMap(null));
    this._memberMarkers.clear();
  }

  public destroy(): void {
    this.stopWatchingLocation();
    this.clearGpxRoute();
    this.clearMemberMarkers();
    this.map?.destroy();
    this.map = null;
  }

  public locate(): void {
    if (!this.map) return;
    if (this.lastPosition) {
      const { latitude, longitude } = this.lastPosition;
      this.map.setCenter(new window.naver.maps.LatLng(latitude, longitude));
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          this.map!.setCenter(new window.naver.maps.LatLng(latitude, longitude));
        },
        (err) => { console.error('[locate] error', err.code, err.message); },
      );
    }
  }

  public stopWatchingLocation(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.locationMarker?.setMap(null);
    this.locationMarker = null;
  }

  public startWatchingLocation(onLocationUpdate?: (lat: number, lng: number) => void): void {
    if (!this.map) return;
    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lastPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
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

        onLocationUpdate?.(latitude, longitude);
      },
      () => { /* 에러 무시 */ },
    );
  }

  public returnToCourse(): void {
    if (!this.map || !this.gpxBounds) return;
    this.map.fitBounds(this.gpxBounds, { top: 50, right: 50, bottom: 50, left: 50 });
  }
}

export { MapStore };
