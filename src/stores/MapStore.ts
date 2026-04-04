import { makeAutoObservable, observable, runInAction } from "mobx";
import type { Checkpoint } from '../types/checkpoint';

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
  private locationAvatarUrl: string | null = null;
  private _memberMarkers: Map<string, naver.maps.Marker> = new Map();
  private _checkpointMarkers: Map<string, naver.maps.Marker> = new Map();
  private _checkpointCircles: Map<string, naver.maps.Circle> = new Map();
  private _onCheckpointTap: ((checkpointId: string) => void) | null = null;
  private _logoEl: HTMLDivElement | null = null;

  public constructor() {
    makeAutoObservable(this, {
      map: observable.ref,
      gpxPolyline: observable.ref,
      startMarker: observable.ref,
      endMarker: observable.ref,
      locationMarker: observable.ref,
    });
  }

  public initMap(el: HTMLDivElement, center?: { lat: number; lng: number }): void {
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
        center: new window.naver.maps.LatLng(
          center?.lat ?? 37.5665,
          center?.lng ?? 126.978,
        ),
        zoom: 14,
        logoControl: false,
      });
      this.map = instance;

      // Naver Maps 기본 로고를 CSS로 강제 숨김
      // logoControl: false 옵션이 적용 안 될 경우 대비
      const hideStyle = document.createElement('style');
      hideStyle.setAttribute('data-map-logo-hide', '');
      hideStyle.textContent = `
        a[href*="ssl.pstatic.net/static/maps/mantle/notice/legal.html"] { display: none !important; }
      `;
      document.head.appendChild(hideStyle);

      const logo = document.createElement('img');
      logo.src = 'http://static.naver.net/maps/mantle/2x/new-naver-logo-normal.png';
      logo.setAttribute('data-custom-logo', '');
      logo.alt = 'NAVER';
      logo.style.cssText = `
        position: absolute;
        left: 6px;
        top: 50%;
        transform: translateY(-50%) rotate(-90deg);
        transform-origin: center center;
        z-index: 10;
        pointer-events: none;
        width: 52px;
        opacity: 0.6;
        user-select: none;
      `;
      el.appendChild(logo);
      this._logoEl = logo as unknown as HTMLDivElement;
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

  public updateMemberMarker(userId: string, displayName: string, lat: number, lng: number, avatarUrl?: string | null): void {
    if (!this.map) return;
    const latLng = new window.naver.maps.LatLng(lat, lng);
    const existing = this._memberMarkers.get(userId);
    if (existing) {
      existing.setPosition(latLng);
    } else {
      const initial = displayName.charAt(0).toUpperCase() || '?';
      const inner = avatarUrl
        ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
        : `<div style="width:100%;height:100%;border-radius:50%;background:#222;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;">${initial}</div>`;
      const content = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="width:32px;height:32px;border-radius:50%;overflow:hidden;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);background:white;flex-shrink:0;">
            ${inner}
          </div>
          <div style="background:rgba(0,0,0,0.72);color:white;border-radius:4px;padding:2px 5px;font-size:10px;font-weight:600;white-space:nowrap;max-width:64px;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em;">${displayName}</div>
        </div>`;
      const marker = new window.naver.maps.Marker({
        map: this.map,
        position: latLng,
        icon: {
          content,
          anchor: new window.naver.maps.Point(16, 16),
        },
      });
      this._memberMarkers.set(userId, marker);
    }
  }

  public clearMemberMarkers(): void {
    this._memberMarkers.forEach((marker) => marker.setMap(null));
    this._memberMarkers.clear();
  }

  public setOnCheckpointTap(cb: ((checkpointId: string) => void) | null): void {
    this._onCheckpointTap = cb;
  }

  public drawCheckpoints(
    checkpoints: Checkpoint[],
    visitedIds: Set<string>,
    nearId: string | null,
  ): void {
    if (!this.map) return;

    // 기존 endMarker 숨기기 (종료 체크포인트가 대체)
    if (checkpoints.some((cp) => cp.is_finish)) {
      this.endMarker?.setMap(null);
    }

    // 체크포인트별 순서 번호 (is_finish 제외)
    let order = 0;
    for (const cp of checkpoints) {
      const isVisited = visitedIds.has(cp.id);
      const isNear = nearId === cp.id;
      if (!cp.is_finish) order++;
      const displayOrder = cp.is_finish ? -1 : order;

      const existing = this._checkpointMarkers.get(cp.id);
      const position = new window.naver.maps.LatLng(cp.lat, cp.lng);

      if (existing) {
        existing.setPosition(position);
        existing.setIcon({
          content: this._buildCheckpointHtml(cp, displayOrder, isVisited, isNear),
          anchor: new window.naver.maps.Point(16, 16),
        });
      } else {
        const marker = new window.naver.maps.Marker({
          map: this.map,
          position,
          icon: {
            content: this._buildCheckpointHtml(cp, displayOrder, isVisited, isNear),
            anchor: new window.naver.maps.Point(16, 16),
          },
          zIndex: 100,
        });
        window.naver.maps.Event.addListener(marker, 'click', () => {
          this._onCheckpointTap?.(cp.id);
        });
        this._checkpointMarkers.set(cp.id, marker);
      }

      // 반경 원
      const existingCircle = this._checkpointCircles.get(cp.id);
      const circleColor = cp.is_finish ? '#F44336' : isNear ? '#000000' : '#000000';
      const circleOpacity = isNear ? 0.12 : 0.05;
      if (existingCircle) {
        existingCircle.setCenter(position);
        existingCircle.setRadius(cp.radius_m);
        existingCircle.setOptions({
          center: position,
          radius: cp.radius_m,
          fillColor: circleColor,
          fillOpacity: circleOpacity,
          strokeColor: circleColor,
          strokeOpacity: isNear ? 0.4 : 0.2,
        });
      } else {
        const circle = new window.naver.maps.Circle({
          map: this.map,
          center: position,
          radius: cp.radius_m,
          strokeColor: circleColor,
          strokeOpacity: 0.2,
          strokeWeight: 1,
          fillColor: circleColor,
          fillOpacity: circleOpacity,
        });
        this._checkpointCircles.set(cp.id, circle);
      }
    }

    // 삭제된 체크포인트 정리
    const currentIds = new Set(checkpoints.map((cp) => cp.id));
    for (const [cpId, marker] of this._checkpointMarkers) {
      if (!currentIds.has(cpId)) {
        marker.setMap(null);
        this._checkpointMarkers.delete(cpId);
      }
    }
    for (const [cpId, circle] of this._checkpointCircles) {
      if (!currentIds.has(cpId)) {
        circle.setMap(null);
        this._checkpointCircles.delete(cpId);
      }
    }
  }

  private _buildCheckpointHtml(
    cp: Checkpoint,
    displayOrder: number,
    isVisited: boolean,
    isNear: boolean,
  ): string {
    if (isVisited) {
      return `<div style="width:32px;height:32px;border-radius:50%;background:#22C55E;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>`;
    }
    if (cp.is_finish) {
      return `<div style="width:32px;height:32px;border-radius:50%;background:#F44336;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);">F</div>`;
    }
    if (isNear) {
      return `<div style="width:32px;height:32px;border-radius:50%;background:#000;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);animation:cp-pulse 1.5s ease-in-out infinite;">
        <style>@keyframes cp-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}</style>
        ${displayOrder}
      </div>`;
    }
    return `<div style="width:32px;height:32px;border-radius:50%;background:white;display:flex;align-items:center;justify-content:center;color:black;font-size:12px;font-weight:bold;border:2px solid black;box-shadow:0 2px 6px rgba(0,0,0,0.15);">${displayOrder}</div>`;
  }

  public clearCheckpoints(): void {
    this._checkpointMarkers.forEach((m) => m.setMap(null));
    this._checkpointMarkers.clear();
    this._checkpointCircles.forEach((c) => c.setMap(null));
    this._checkpointCircles.clear();
  }

  public destroy(): void {
    this.stopWatchingLocation();
    this.clearGpxRoute();
    this.clearMemberMarkers();
    this.clearCheckpoints();
    this._logoEl?.remove();
    this._logoEl = null;
    document.head.querySelector('style[data-map-logo-hide]')?.remove();
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

  private _buildLocationMarkerContent(): string {
    const avatarUrl = this.locationAvatarUrl;
    const inner = avatarUrl
      ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : `<div style="width:100%;height:100%;border-radius:50%;background:#222;"></div>`;

    return `
      <style>
        @keyframes loc-pulse {
          0%   { transform: scale(1);   opacity: 0.5; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes loc-pulse2 {
          0%   { transform: scale(1);   opacity: 0.3; }
          70%  { transform: scale(1.7); opacity: 0; }
          100% { transform: scale(1.7); opacity: 0; }
        }
      </style>
      <div style="position:relative;width:60px;height:76px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;">
        <div style="position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.15);animation:loc-pulse 2s ease-out infinite;z-index:0;"></div>
          <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.1);animation:loc-pulse2 2s ease-out 0.4s infinite;z-index:0;"></div>
          <div style="position:relative;width:36px;height:36px;border-radius:50%;overflow:hidden;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);flex-shrink:0;z-index:1;background:white;">
            ${inner}
          </div>
        </div>
        <div style="margin-top:-2px;font-size:11px;font-weight:700;color:#222;text-align:center;z-index:1;text-shadow:0 0 3px white,0 0 3px white,0 0 3px white;white-space:nowrap;">내 위치</div>
      </div>`;
  }

  public setLocationAvatarUrl(url: string | null): void {
    this.locationAvatarUrl = url;
    if (this.locationMarker) {
      this.locationMarker.setIcon({ content: this._buildLocationMarkerContent(), anchor: new window.naver.maps.Point(30, 30) });
    }
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
                content: this._buildLocationMarkerContent(),
                anchor: new window.naver.maps.Point(30, 30),
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
