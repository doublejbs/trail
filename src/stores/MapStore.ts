import { makeAutoObservable, observable, runInAction } from "mobx";
import { getCurrentPosition, watchPosition, clearWatch } from '../lib/geolocation';

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;
  public locationMarker: naver.maps.Marker | null = null;

  private watchId: string | null = null;
  private lastPosition: { latitude: number; longitude: number } | null = null;
  private _logoEl: HTMLDivElement | null = null;
  private _markerStyle: 'blue' | 'avatar' = 'blue';
  private _avatarUrl: string | null = null;

  public constructor() {
    makeAutoObservable(this, {
      map: observable.ref,
      locationMarker: observable.ref,
    });
  }

  public initMap(el: HTMLDivElement, center?: { lat: number; lng: number }): void {
    if (this.map) return;

    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
    if (!clientId) {
      alert('[Map Debug] VITE_NAVER_MAP_CLIENT_ID is not set');
      this.error = true;
      return;
    }

    if (!window.naver?.maps?.Map) {
      alert(`[Map Debug] Naver Maps SDK not loaded. window.naver=${typeof (window as unknown as Record<string, unknown>).naver}, origin=${window.location.origin}`);
      this.error = true;
      return;
    }

    (window as Window & { navermap_authFailure?: () => void }).navermap_authFailure = () => {
      alert(`[Map Auth Failed] origin=${window.location.origin}, href=${window.location.href}`);
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

  public destroy(): void {
    this.stopWatchingLocation();
    this._logoEl?.remove();
    this._logoEl = null;
    document.head.querySelector('style[data-map-logo-hide]')?.remove();
    this.map?.destroy();
    this.map = null;
  }

  private static LOCATE_MIN_ZOOM = 15;

  public locate(): void {
    if (!this.map) return;
    if (this.lastPosition) {
      this._moveToPosition(this.lastPosition.latitude, this.lastPosition.longitude);
    } else {
      getCurrentPosition()
        .then((pos) => { this._moveToPosition(pos.latitude, pos.longitude); })
        .catch((err) => { console.error('[locate] error', err); });
    }
  }

  private _moveToPosition(lat: number, lng: number): void {
    if (!this.map) return;
    const latlng = new window.naver.maps.LatLng(lat, lng);
    const targetZoom = Math.max(this.map.getZoom(), MapStore.LOCATE_MIN_ZOOM);
    this.map.morph(latlng, targetZoom);
  }

  public stopWatchingLocation(): void {
    if (this.watchId !== null) {
      clearWatch(this.watchId);
      this.watchId = null;
    }
    this.locationMarker?.setMap(null);
    this.locationMarker = null;
  }

  private static MARKER_SIZE = 40;

  private _buildLocationMarkerContent(): string {
    if (this._markerStyle === 'avatar') return this._buildAvatarMarker();
    return this._buildBlueMarker();
  }

  private _buildBlueMarker(): string {
    const s = MapStore.MARKER_SIZE;
    return `
      <style>
        @keyframes loc-pulse {
          0%   { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(2.4); opacity: 0; }
        }
      </style>
      <div style="position:relative;width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:${s}px;height:${s}px;border-radius:50%;background:rgba(66,133,244,0.25);animation:loc-pulse 1.8s ease-out infinite;"></div>
        <div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);position:relative;z-index:1;"></div>
      </div>`;
  }

  private _buildAvatarMarker(): string {
    const s = MapStore.MARKER_SIZE;
    const inner = this._avatarUrl
      ? `<img src="${this._avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : `<div style="width:100%;height:100%;border-radius:50%;background:#222;"></div>`;
    return `
      <style>
        @keyframes loc-pulse {
          0%   { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(2.4); opacity: 0; }
        }
      </style>
      <div style="position:relative;width:${s}px;height:${s + 18}px;display:flex;flex-direction:column;align-items:center;">
        <div style="position:relative;width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,0.12);animation:loc-pulse 2s ease-out infinite;"></div>
          <div style="position:relative;width:32px;height:32px;border-radius:50%;overflow:hidden;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);z-index:1;background:white;">
            ${inner}
          </div>
        </div>
        <div style="margin-top:-2px;font-size:11px;font-weight:700;color:#222;text-align:center;z-index:1;text-shadow:0 0 3px white,0 0 3px white,0 0 3px white;white-space:nowrap;">내 위치</div>
      </div>`;
  }

  public setLocationAvatarUrl(url: string | null): void {
    this._avatarUrl = url;
    if (this.locationMarker) {
      const half = MapStore.MARKER_SIZE / 2;
      this.locationMarker.setIcon({ content: this._buildLocationMarkerContent(), anchor: new window.naver.maps.Point(half, half) });
    }
  }

  public startWatchingLocation(onLocationUpdate?: (lat: number, lng: number) => void, markerStyle: 'blue' | 'avatar' = 'blue'): void {
    if (!this.map) return;
    this._markerStyle = markerStyle;

    watchPosition(
      (pos) => {
        this.lastPosition = { latitude: pos.latitude, longitude: pos.longitude };
        if (!this.map) return;
        const latLng = new window.naver.maps.LatLng(pos.latitude, pos.longitude);

        runInAction(() => {
          if (!this.locationMarker) {
            const half = MapStore.MARKER_SIZE / 2;
            this.locationMarker = new window.naver.maps.Marker({
              map: this.map!,
              position: latLng,
              clickable: false,
              zIndex: 50,
              icon: {
                content: this._buildLocationMarkerContent(),
                anchor: new window.naver.maps.Point(half, half),
              },
            });
          } else {
            this.locationMarker.setPosition(latLng);
          }
        });

        onLocationUpdate?.(pos.latitude, pos.longitude);
      },
    ).then((id) => {
      this.watchId = id;
    });
  }
}

export { MapStore };
