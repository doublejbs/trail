import { makeAutoObservable } from 'mobx';

class MemberMarkerStore {
  private _memberMarkers: Map<string, naver.maps.Marker> = new Map();
  private getMap: () => naver.maps.Map | null;

  public constructor(getMap: () => naver.maps.Map | null) {
    this.getMap = getMap;
    makeAutoObservable(this);
  }

  public updateMemberMarker(userId: string, displayName: string, lat: number, lng: number, avatarUrl?: string | null): void {
    const map = this.getMap();
    if (!map) return;
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
        map,
        position: latLng,
        icon: {
          content,
          anchor: new window.naver.maps.Point(16, 16),
        },
      });
      this._memberMarkers.set(userId, marker);
    }
  }

  public clearAll(): void {
    this._memberMarkers.forEach((marker) => marker.setMap(null));
    this._memberMarkers.clear();
  }
}

export { MemberMarkerStore };
