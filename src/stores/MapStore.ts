import { makeAutoObservable, observable, runInAction } from "mobx";

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;
  public gpxPolyline: naver.maps.Polyline | null = null;

  public constructor() {
    makeAutoObservable(this, { map: observable.ref, gpxPolyline: observable.ref });
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
    this.gpxPolyline = polyline;
  }

  public clearGpxRoute(): void {
    this.gpxPolyline?.setMap(null);
    this.gpxPolyline = null;
  }

  public destroy(): void {
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
}

export { MapStore };
