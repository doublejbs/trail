import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapStore } from './MapStore';

const mockPolyline = { setMap: vi.fn() };
const mockStartMarker = { setMap: vi.fn() };
const mockEndMarker = { setMap: vi.fn() };
const mockMap = { setCenter: vi.fn(), destroy: vi.fn() };
const mockNaverMaps = {
  Map: vi.fn(function () { return mockMap; }),
  LatLng: vi.fn(function (lat: number, lng: number) { return { lat, lng }; }),
  Polyline: vi.fn(function () { return mockPolyline; }),
  Marker: vi.fn(),
  Point: vi.fn(function (x: number, y: number) { return { x, y }; }),
};

const GPX_TWO_POINTS = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk><trkseg>
    <trkpt lat="37.5" lon="126.9"></trkpt>
    <trkpt lat="37.6" lon="127.0"></trkpt>
  </trkseg></trk>
</gpx>`;

const GPX_NO_POINTS = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"></gpx>`;
const GPX_ONE_POINT = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><trkseg><trkpt lat="37.5" lon="126.9"></trkpt></trkseg></trk></gpx>`;
const GPX_INVALID_COORDS = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><trkseg><trkpt lat="NaN" lon="NaN"></trkpt></trkseg></trk></gpx>`;

describe('MapStore', () => {
  let store: MapStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNaverMaps.Map.mockImplementation(function () { return mockMap; });
    vi.stubEnv('VITE_NAVER_MAP_CLIENT_ID', 'test-key');
    store = new MapStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as unknown as Record<string, unknown>).naver;
  });

  describe('initial state', () => {
    it('map is null initially', () => {
      expect(store.map).toBeNull();
    });

    it('error is false initially', () => {
      expect(store.error).toBe(false);
    });
  });

  describe('initMap()', () => {
    it('sets map on success', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      expect(store.map).toBe(mockMap);
      expect(store.error).toBe(false);
    });

    it('sets error=true when window.naver is missing', () => {
      delete (window as unknown as Record<string, unknown>).naver;
      const div = document.createElement('div');
      store.initMap(div);
      expect(store.map).toBeNull();
      expect(store.error).toBe(true);
    });

    it('sets error=true when VITE_NAVER_MAP_CLIENT_ID is not set', () => {
      vi.stubEnv('VITE_NAVER_MAP_CLIENT_ID', '');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      expect(store.error).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith('VITE_NAVER_MAP_CLIENT_ID is not set');
      warnSpy.mockRestore();
    });

    it('sets error=true when Map constructor throws', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockNaverMaps.Map.mockImplementation(function () { throw new Error('init fail'); });
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      expect(store.map).toBeNull();
      expect(store.error).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('passes correct center coordinates', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      expect(mockNaverMaps.LatLng).toHaveBeenCalledWith(37.5665, 126.978);
    });
  });

  describe('locate()', () => {
    it('does nothing when map is null', () => {
      const getSpy = vi.spyOn(navigator.geolocation, 'getCurrentPosition');
      store.locate();
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('does nothing when navigator.geolocation is absent', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      const originalGeolocation = navigator.geolocation;
      Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
      store.locate();
      // no error thrown — method exits silently
      Object.defineProperty(navigator, 'geolocation', { value: originalGeolocation, configurable: true });
    });

    it('calls getCurrentPosition when map is set', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      const getSpy = vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation(() => {});
      store.locate();
      expect(getSpy).toHaveBeenCalledOnce();
    });

    it('calls map.setCenter with current position', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation((cb) => {
        cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
      });
      store.locate();
      expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 37.1, lng: 127.1 });
    });
  });

  describe('GPX 기능', () => {
    let markerCallCount = 0;
    beforeEach(() => {
      markerCallCount = 0;
      mockNaverMaps.Polyline.mockImplementation(function () { return mockPolyline; });
      mockNaverMaps.Marker.mockImplementation(function () {
        const count = markerCallCount++;
        return count === 0 ? mockStartMarker : mockEndMarker;
      });
      store = new MapStore();
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      store.initMap(document.createElement('div'));
    });

    describe('drawGpxRoute()', () => {
      it('map이 null이면 error=true 설정 후 반환', () => {
        store = new MapStore(); // map이 null인 새 store
        store.drawGpxRoute(GPX_TWO_POINTS);
        expect(store.error).toBe(true);
        expect(store.gpxPolyline).toBeNull();
      });

      it('유효한 GPX로 gpxPolyline 설정', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        expect(store.gpxPolyline).toBe(mockPolyline);
        expect(store.error).toBe(false);
      });

      it('trackpoint 없으면 error=true, gpxPolyline=null', () => {
        store.drawGpxRoute(GPX_NO_POINTS);
        expect(store.error).toBe(true);
        expect(store.gpxPolyline).toBeNull();
      });

      it('모든 trackpoint 좌표가 유효하지 않으면 error=true, gpxPolyline=null', () => {
        store.drawGpxRoute(GPX_INVALID_COORDS);
        expect(store.error).toBe(true);
        expect(store.gpxPolyline).toBeNull();
      });

      it('첫 번째 trackpoint로 지도 중심 이동', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 37.5, lng: 126.9 });
      });

      it('올바른 좌표 배열로 Polyline 생성', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        expect(mockNaverMaps.Polyline).toHaveBeenCalledWith(
          expect.objectContaining({
            map: mockMap,
            path: [
              { lat: 37.5, lng: 126.9 },
              { lat: 37.6, lng: 127.0 },
            ],
          }),
        );
      });
    });

    describe('clearGpxRoute()', () => {
      it('polyline을 지도에서 제거하고 gpxPolyline=null', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        store.clearGpxRoute();
        expect(mockPolyline.setMap).toHaveBeenCalledWith(null);
        expect(store.gpxPolyline).toBeNull();
      });

      it('gpxPolyline이 null일 때 오류 없이 실행', () => {
        expect(() => store.clearGpxRoute()).not.toThrow();
      });
    });

    describe('destroy() GPX 정리', () => {
      it('destroy() 호출 시 gpxPolyline 제거', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        store.destroy();
        expect(mockPolyline.setMap).toHaveBeenCalledWith(null);
        expect(store.gpxPolyline).toBeNull();
      });

      it('destroy() 호출 시 clearWatch 호출', () => {
        const clearSpy = vi.spyOn(navigator.geolocation, 'clearWatch').mockImplementation(() => {});
        vi.spyOn(navigator.geolocation, 'watchPosition').mockReturnValue(42);
        store.startWatchingLocation();
        store.destroy();
        expect(clearSpy).toHaveBeenCalledWith(42);
      });
    });

    describe('재호출 시 이전 경로 정리', () => {
      it('drawGpxRoute() 재호출 시 이전 polyline.setMap(null) 호출', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        store.drawGpxRoute(GPX_TWO_POINTS);
        expect(mockPolyline.setMap).toHaveBeenCalledWith(null);
      });
    });

    describe('마커', () => {
      it('drawGpxRoute() 후 startMarker가 설정됨', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        expect(store.startMarker).toBe(mockStartMarker);
      });

      it('drawGpxRoute() 후 endMarker가 설정됨', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        expect(store.endMarker).toBe(mockEndMarker);
      });

      it('시작 마커가 첫 번째 trackpoint 좌표로 생성됨', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        expect(mockNaverMaps.Marker.mock.calls[0][0].position).toEqual({ lat: 37.5, lng: 126.9 });
      });

      it('종료 마커가 마지막 trackpoint 좌표로 생성됨', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        expect(mockNaverMaps.Marker.mock.calls[1][0].position).toEqual({ lat: 37.6, lng: 127.0 });
      });

      it('trackpoint 1개일 때 endMarker가 null이고 Marker가 1번만 호출됨', () => {
        store.drawGpxRoute(GPX_ONE_POINT);
        expect(store.endMarker).toBeNull();
        expect(mockNaverMaps.Marker).toHaveBeenCalledTimes(1);
      });

      it('clearGpxRoute() 후 startMarker.setMap(null) 호출 및 null', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        store.clearGpxRoute();
        expect(mockStartMarker.setMap).toHaveBeenCalledWith(null);
        expect(store.startMarker).toBeNull();
      });

      it('clearGpxRoute() 후 endMarker.setMap(null) 호출 및 null', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        store.clearGpxRoute();
        expect(mockEndMarker.setMap).toHaveBeenCalledWith(null);
        expect(store.endMarker).toBeNull();
      });

      it('destroy() 후 두 마커 모두 정리됨', () => {
        store.drawGpxRoute(GPX_TWO_POINTS);
        store.destroy();
        expect(mockStartMarker.setMap).toHaveBeenCalledWith(null);
        expect(mockEndMarker.setMap).toHaveBeenCalledWith(null);
        expect(store.startMarker).toBeNull();
        expect(store.endMarker).toBeNull();
      });
    });
  });

  describe('startWatchingLocation()', () => {
    let watchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      const defaultLocationMarker = { setMap: vi.fn(), setPosition: vi.fn() };
      mockNaverMaps.Marker.mockImplementation(function () { return defaultLocationMarker; });
      watchSpy = vi.spyOn(navigator.geolocation, 'watchPosition').mockImplementation(() => 42);
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      store = new MapStore();
      store.initMap(document.createElement('div'));
    });

    it('map이 있으면 watchPosition 호출', () => {
      store.startWatchingLocation();
      expect(watchSpy).toHaveBeenCalledOnce();
    });

    it('map이 null이면 watchPosition 미호출', () => {
      store = new MapStore(); // map이 null인 새 store
      store.startWatchingLocation();
      expect(watchSpy).not.toHaveBeenCalled();
    });

    it('위치 콜백에서 setCenter 미호출', () => {
      watchSpy.mockImplementation((cb) => {
        cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
        return 42;
      });
      store.startWatchingLocation();
      expect(mockMap.setCenter).not.toHaveBeenCalled();
    });

    it('위치 콜백에서 Marker 생성', () => {
      const mockLocationMarker = { setMap: vi.fn(), setPosition: vi.fn() };
      mockNaverMaps.Marker.mockImplementation(function () { return mockLocationMarker; });
      watchSpy.mockImplementation((cb) => {
        cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
        return 42;
      });
      store.startWatchingLocation();
      expect(store.locationMarker).not.toBeNull();
    });

    it('두 번째 위치 콜백에서 새 마커 생성 없이 setPosition 호출', () => {
      const mockLocationMarker = { setMap: vi.fn(), setPosition: vi.fn() };
      mockNaverMaps.Marker.mockImplementation(function () { return mockLocationMarker; });
      let cbRef: ((pos: GeolocationPosition) => void) | null = null;
      watchSpy.mockImplementation((cb) => {
        cbRef = cb as (pos: GeolocationPosition) => void;
        cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
        return 42;
      });
      store.startWatchingLocation();
      const markerCallsBefore = (mockNaverMaps.Marker as ReturnType<typeof vi.fn>).mock.calls.length;
      cbRef!({ coords: { latitude: 37.2, longitude: 127.2 } } as GeolocationPosition);
      expect((mockNaverMaps.Marker as ReturnType<typeof vi.fn>).mock.calls.length).toBe(markerCallsBefore);
      expect(mockLocationMarker.setPosition).toHaveBeenCalledWith({ lat: 37.2, lng: 127.2 });
    });
  });

  describe('stopWatchingLocation()', () => {
    let watchSpy: ReturnType<typeof vi.spyOn>;
    let clearSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      watchSpy = vi.spyOn(navigator.geolocation, 'watchPosition').mockReturnValue(42);
      clearSpy = vi.spyOn(navigator.geolocation, 'clearWatch').mockImplementation(() => {});
      const mockLocationMarker = { setMap: vi.fn(), setPosition: vi.fn() };
      mockNaverMaps.Marker.mockImplementation(function () { return mockLocationMarker; });
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      store = new MapStore();
      store.initMap(document.createElement('div'));
    });

    it('clearWatch 호출 + 마커 제거', () => {
      // 위치 콜백으로 마커 먼저 생성
      watchSpy.mockImplementation((cb) => {
        cb({ coords: { latitude: 37.1, longitude: 127.1 } } as GeolocationPosition);
        return 42;
      });
      store.startWatchingLocation();
      store.stopWatchingLocation();
      expect(clearSpy).toHaveBeenCalledWith(42);
      expect(store.locationMarker).toBeNull();
    });

    it('watchId가 null이면 clearWatch 미호출', () => {
      store.stopWatchingLocation();
      expect(clearSpy).not.toHaveBeenCalled();
    });
  });
});
