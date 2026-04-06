import { makeAutoObservable, observable, runInAction } from "mobx";

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;
  public locationMarker: naver.maps.Marker | null = null;

  private watchId: number | null = null;
  private lastPosition: { latitude: number; longitude: number } | null = null;
  private locationAvatarUrl: string | null = null;
  private _memberMarkers: Map<string, naver.maps.Marker> = new Map();
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

        onLocationUpdate?.(latitude, longitude);
      },
      () => { /* 에러 무시 */ },
    );
  }
}

export { MapStore };
