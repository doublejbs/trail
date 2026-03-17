import { makeAutoObservable, observable } from 'mobx';

class MapStore {
  public map: naver.maps.Map | null = null;
  public error: boolean = false;

  public constructor() {
    makeAutoObservable(this, { map: observable.ref });
  }

  public initMap(el: HTMLDivElement): void {
    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
    if (!clientId) {
      console.warn('VITE_NAVER_MAP_CLIENT_ID is not set');
      this.error = true;
      return;
    }

    if (!window.naver) {
      this.error = true;
      return;
    }

    try {
      const instance = new window.naver.maps.Map(el, {
        center: new window.naver.maps.LatLng(37.5665, 126.978),
        zoom: 14,
      });
      this.map = instance;
    } catch (e) {
      console.error('Naver Maps init failed:', e);
      this.error = true;
    }
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
