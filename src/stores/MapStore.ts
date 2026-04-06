import { makeAutoObservable, observable, runInAction } from "mobx";
import { getCurrentPosition, watchPosition, clearWatch } from '../lib/geolocation';

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;
  public locationMarker: naver.maps.Marker | null = null;

  private watchId: string | null = null;
  private lastPosition: { latitude: number; longitude: number } | null = null;
  private locationAvatarUrl: string | null = null;
  private _logoEl: HTMLDivElement | null = null;

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

  public destroy(): void {
    this.stopWatchingLocation();
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
    } else {
      getCurrentPosition()
        .then((pos) => {
          this.map?.setCenter(new window.naver.maps.LatLng(pos.latitude, pos.longitude));
        })
        .catch((err) => { console.error('[locate] error', err); });
    }
  }

  public stopWatchingLocation(): void {
    if (this.watchId !== null) {
      clearWatch(this.watchId);
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

    watchPosition(
      (pos) => {
        this.lastPosition = { latitude: pos.latitude, longitude: pos.longitude };
        if (!this.map) return;
        const latLng = new window.naver.maps.LatLng(pos.latitude, pos.longitude);

        runInAction(() => {
          if (!this.locationMarker) {
            this.locationMarker = new window.naver.maps.Marker({
              map: this.map!,
              position: latLng,
              clickable: false,
              zIndex: 50,
              icon: {
                content: this._buildLocationMarkerContent(),
                anchor: new window.naver.maps.Point(30, 30),
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
