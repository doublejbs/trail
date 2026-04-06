import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapStore } from './MapStore';
import { MapRenderingStore } from './MapRenderingStore';
import { getCurrentPosition, watchPosition, clearWatch } from '../lib/geolocation';

vi.mock('../lib/geolocation', () => ({
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
  requestPermission: vi.fn().mockResolvedValue(true),
}));

const mockPolyline = { setMap: vi.fn() };
const mockStartMarker = { setMap: vi.fn() };
const mockEndMarker = { setMap: vi.fn() };
const mockMap = { setCenter: vi.fn(), destroy: vi.fn(), fitBounds: vi.fn(), getBounds: vi.fn() };
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
    <trkpt lat="37.5000" lon="126.9000"></trkpt>
    <trkpt lat="37.5005" lon="126.9005"></trkpt>
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
      store.locate();
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it('calls getCurrentPosition when map is set', () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      vi.mocked(getCurrentPosition).mockResolvedValue({ latitude: 37.1, longitude: 127.1 });
      store.locate();
      expect(getCurrentPosition).toHaveBeenCalledOnce();
    });

    it('calls map.setCenter with current position', async () => {
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      const div = document.createElement('div');
      store.initMap(div);
      vi.mocked(getCurrentPosition).mockResolvedValue({ latitude: 37.1, longitude: 127.1 });
      store.locate();
      await vi.waitFor(() => {
        expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 37.1, lng: 127.1 });
      });
    });
  });

  describe('GPX 기능 (MapRenderingStore)', () => {
    let markerCallCount = 0;
    let renderingStore: MapRenderingStore;
    beforeEach(() => {
      markerCallCount = 0;
      mockNaverMaps.Polyline.mockImplementation(function () { return mockPolyline; });
      mockNaverMaps.Marker.mockImplementation(function () {
        const count = markerCallCount++;
        return count === 0 ? mockStartMarker : mockEndMarker;
      });
      const mockBoundsInstance = { extend: vi.fn().mockReturnThis(), intersects: vi.fn().mockReturnValue(true) };
      (mockNaverMaps as Record<string, unknown>).LatLngBounds = vi.fn(function () { return mockBoundsInstance; });
      (mockNaverMaps as Record<string, unknown>).Event = {
        addListener: vi.fn(() => ({ id: 'idle-listener' })),
        removeListener: vi.fn(),
      };
      store = new MapStore();
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      store.initMap(document.createElement('div'));
      renderingStore = new MapRenderingStore(() => store.map);
    });

    describe('drawGpxRoute()', () => {
      it('map이 null이면 false 반환', () => {
        const emptyStore = new MapStore();
        const emptyRendering = new MapRenderingStore(() => emptyStore.map);
        const result = emptyRendering.drawGpxRoute(GPX_TWO_POINTS);
        expect(result).toBe(false);
        expect(emptyRendering.gpxPolyline).toBeNull();
      });

      it('유효한 GPX로 gpxPolyline 설정', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        expect(renderingStore.gpxPolyline).toBe(mockPolyline);
      });

      it('trackpoint 없으면 false 반환, gpxPolyline=null', () => {
        const result = renderingStore.drawGpxRoute(GPX_NO_POINTS);
        expect(result).toBe(false);
        expect(renderingStore.gpxPolyline).toBeNull();
      });

      it('모든 trackpoint 좌표가 유효하지 않으면 false 반환, gpxPolyline=null', () => {
        const result = renderingStore.drawGpxRoute(GPX_INVALID_COORDS);
        expect(result).toBe(false);
        expect(renderingStore.gpxPolyline).toBeNull();
      });

      it('첫 번째 trackpoint로 지도 중심 이동', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        expect(mockMap.setCenter).toHaveBeenCalledWith({ lat: 37.5, lng: 126.9 });
      });

      it('올바른 좌표 배열로 Polyline 생성', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        expect(mockNaverMaps.Polyline).toHaveBeenCalledWith(
          expect.objectContaining({
            map: mockMap,
            path: [
              { lat: 37.5, lng: 126.9 },
              { lat: 37.5005, lng: 126.9005 },
            ],
          }),
        );
      });
    });

    describe('clearGpxRoute()', () => {
      it('polyline을 지도에서 제거하고 gpxPolyline=null', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        renderingStore.clearGpxRoute();
        expect(mockPolyline.setMap).toHaveBeenCalledWith(null);
        expect(renderingStore.gpxPolyline).toBeNull();
      });

      it('gpxPolyline이 null일 때 오류 없이 실행', () => {
        expect(() => renderingStore.clearGpxRoute()).not.toThrow();
      });
    });

    describe('destroy() GPX 정리', () => {
      it('destroy() 호출 시 gpxPolyline 제거', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        renderingStore.destroy();
        expect(mockPolyline.setMap).toHaveBeenCalledWith(null);
        expect(renderingStore.gpxPolyline).toBeNull();
      });

      it('MapStore destroy() 호출 시 clearWatch 호출', async () => {
        vi.mocked(watchPosition).mockImplementation(async (_cb) => '42');
        store.startWatchingLocation();
        await vi.waitFor(() => { expect(store['watchId']).toBe('42'); });
        store.destroy();
        expect(clearWatch).toHaveBeenCalledWith('42');
      });
    });

    describe('재호출 시 이전 경로 정리', () => {
      it('drawGpxRoute() 재호출 시 이전 polyline.setMap(null) 호출', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        expect(mockPolyline.setMap).toHaveBeenCalledWith(null);
      });
    });

    describe('마커', () => {
      it('drawGpxRoute() 후 startMarker가 설정됨', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        expect(renderingStore.startMarker).toBe(mockStartMarker);
      });

      it('drawGpxRoute() 후 endMarker가 설정됨', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        expect(renderingStore.endMarker).toBe(mockEndMarker);
      });

      it('시작 마커가 첫 번째 trackpoint 좌표로 생성됨', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        expect(mockNaverMaps.Marker.mock.calls[0][0].position).toEqual({ lat: 37.5, lng: 126.9 });
      });

      it('종료 마커가 마지막 trackpoint 좌표로 생성됨', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        expect(mockNaverMaps.Marker.mock.calls[1][0].position).toEqual({ lat: 37.5005, lng: 126.9005 });
      });

      it('trackpoint 1개일 때 endMarker가 null이고 Marker가 1번만 호출됨', () => {
        renderingStore.drawGpxRoute(GPX_ONE_POINT);
        expect(renderingStore.endMarker).toBeNull();
        expect(mockNaverMaps.Marker).toHaveBeenCalledTimes(1);
      });

      it('clearGpxRoute() 후 startMarker.setMap(null) 호출 및 null', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        renderingStore.clearGpxRoute();
        expect(mockStartMarker.setMap).toHaveBeenCalledWith(null);
        expect(renderingStore.startMarker).toBeNull();
      });

      it('clearGpxRoute() 후 endMarker.setMap(null) 호출 및 null', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        renderingStore.clearGpxRoute();
        expect(mockEndMarker.setMap).toHaveBeenCalledWith(null);
        expect(renderingStore.endMarker).toBeNull();
      });

      it('destroy() 후 두 마커 모두 정리됨', () => {
        renderingStore.drawGpxRoute(GPX_TWO_POINTS);
        renderingStore.destroy();
        expect(mockStartMarker.setMap).toHaveBeenCalledWith(null);
        expect(mockEndMarker.setMap).toHaveBeenCalledWith(null);
        expect(renderingStore.startMarker).toBeNull();
        expect(renderingStore.endMarker).toBeNull();
      });
    });
  });

  describe('startWatchingLocation()', () => {
    beforeEach(() => {
      const defaultLocationMarker = { setMap: vi.fn(), setPosition: vi.fn() };
      mockNaverMaps.Marker.mockImplementation(function () { return defaultLocationMarker; });
      vi.mocked(watchPosition).mockImplementation(async (_cb) => '42');
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      store = new MapStore();
      store.initMap(document.createElement('div'));
    });

    it('map이 있으면 watchPosition 호출', () => {
      store.startWatchingLocation();
      expect(watchPosition).toHaveBeenCalledOnce();
    });

    it('map이 null이면 watchPosition 미호출', () => {
      store = new MapStore(); // map이 null인 새 store
      store.startWatchingLocation();
      expect(watchPosition).not.toHaveBeenCalled();
    });

    it('위치 콜백에서 setCenter 미호출', () => {
      vi.mocked(watchPosition).mockImplementation(async (cb) => {
        cb({ latitude: 37.1, longitude: 127.1 });
        return '42';
      });
      store.startWatchingLocation();
      expect(mockMap.setCenter).not.toHaveBeenCalled();
    });

    it('위치 콜백에서 Marker 생성', () => {
      const mockLocationMarker = { setMap: vi.fn(), setPosition: vi.fn() };
      mockNaverMaps.Marker.mockImplementation(function () { return mockLocationMarker; });
      vi.mocked(watchPosition).mockImplementation(async (cb) => {
        cb({ latitude: 37.1, longitude: 127.1 });
        return '42';
      });
      store.startWatchingLocation();
      expect(store.locationMarker).not.toBeNull();
    });

    it('두 번째 위치 콜백에서 새 마커 생성 없이 setPosition 호출', () => {
      const mockLocationMarker = { setMap: vi.fn(), setPosition: vi.fn() };
      mockNaverMaps.Marker.mockImplementation(function () { return mockLocationMarker; });
      let cbRef: ((pos: { latitude: number; longitude: number }) => void) | null = null;
      vi.mocked(watchPosition).mockImplementation(async (cb) => {
        cbRef = cb;
        cb({ latitude: 37.1, longitude: 127.1 });
        return '42';
      });
      store.startWatchingLocation();
      const markerCallsBefore = (mockNaverMaps.Marker as ReturnType<typeof vi.fn>).mock.calls.length;
      cbRef!({ latitude: 37.2, longitude: 127.2 });
      expect((mockNaverMaps.Marker as ReturnType<typeof vi.fn>).mock.calls.length).toBe(markerCallsBefore);
      expect(mockLocationMarker.setPosition).toHaveBeenCalledWith({ lat: 37.2, lng: 127.2 });
    });

    it('onLocationUpdate 콜백이 올바른 좌표로 호출됨', () => {
      const callback = vi.fn();
      vi.mocked(watchPosition).mockImplementation(async (cb) => {
        cb({ latitude: 37.1, longitude: 127.1 });
        return '42';
      });
      store.startWatchingLocation(callback);
      expect(callback).toHaveBeenCalledWith(37.1, 127.1);
    });

    it('콜백 없이 호출해도 기존 동작 유지', () => {
      vi.mocked(watchPosition).mockImplementation(async (cb) => {
        cb({ latitude: 37.1, longitude: 127.1 });
        return '42';
      });
      expect(() => store.startWatchingLocation()).not.toThrow();
      expect(store.locationMarker).not.toBeNull();
    });
  });

  describe('stopWatchingLocation()', () => {
    beforeEach(() => {
      vi.mocked(watchPosition).mockImplementation(async (_cb) => '42');
      const mockLocationMarker = { setMap: vi.fn(), setPosition: vi.fn() };
      mockNaverMaps.Marker.mockImplementation(function () { return mockLocationMarker; });
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      store = new MapStore();
      store.initMap(document.createElement('div'));
    });

    it('clearWatch 호출 + 마커 제거', async () => {
      // 위치 콜백으로 마커 먼저 생성
      vi.mocked(watchPosition).mockImplementation(async (cb) => {
        cb({ latitude: 37.1, longitude: 127.1 });
        return '42';
      });
      store.startWatchingLocation();
      await vi.waitFor(() => { expect(store['watchId']).toBe('42'); });
      store.stopWatchingLocation();
      expect(clearWatch).toHaveBeenCalledWith('42');
      expect(store.locationMarker).toBeNull();
    });

    it('watchId가 null이면 clearWatch 미호출', () => {
      store.stopWatchingLocation();
      expect(clearWatch).not.toHaveBeenCalled();
    });
  });

  describe('gpxBounds 및 isCourseVisible (MapRenderingStore)', () => {
    let mockBounds: { extend: ReturnType<typeof vi.fn>; intersects: ReturnType<typeof vi.fn> };
    let idleCallback: (() => void) | null;
    let renderingStore: MapRenderingStore;

    beforeEach(() => {
      mockBounds = { extend: vi.fn().mockReturnThis(), intersects: vi.fn().mockReturnValue(true) };
      idleCallback = null;
      (mockNaverMaps as Record<string, unknown>).LatLngBounds = vi.fn(function () { return mockBounds; });
      (mockNaverMaps as Record<string, unknown>).Event = {
        addListener: vi.fn((_map: unknown, event: string, cb: () => void) => {
          if (event === 'idle') idleCallback = cb;
          return { id: 'idle-listener' };
        }),
        removeListener: vi.fn(),
      };
      mockNaverMaps.Polyline.mockImplementation(function () { return mockPolyline; });
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      store = new MapStore();
      store.initMap(document.createElement('div'));
      renderingStore = new MapRenderingStore(() => store.map);
    });

    it('drawGpxRoute 성공 후 LatLngBounds 생성', () => {
      renderingStore.drawGpxRoute(GPX_TWO_POINTS);
      expect((mockNaverMaps as Record<string, unknown>).LatLngBounds).toHaveBeenCalled();
    });

    it('drawGpxRoute 성공 후 idle 이벤트 리스너 등록', () => {
      renderingStore.drawGpxRoute(GPX_TWO_POINTS);
      expect(((mockNaverMaps as Record<string, unknown>).Event as { addListener: ReturnType<typeof vi.fn> }).addListener)
        .toHaveBeenCalledWith(mockMap, 'idle', expect.any(Function));
    });

    it('idle 콜백 — intersects false이면 isCourseVisible=false', () => {
      renderingStore.drawGpxRoute(GPX_TWO_POINTS);
      mockMap.getBounds.mockReturnValue({ intersects: vi.fn().mockReturnValue(false) });
      idleCallback!();
      expect(renderingStore.isCourseVisible).toBe(false);
    });

    it('idle 콜백 — intersects true이면 isCourseVisible=true', () => {
      renderingStore.drawGpxRoute(GPX_TWO_POINTS);
      mockMap.getBounds.mockReturnValue({ intersects: vi.fn().mockReturnValue(true) });
      renderingStore.isCourseVisible = false;
      idleCallback!();
      expect(renderingStore.isCourseVisible).toBe(true);
    });

    it('clearGpxRoute 후 isCourseVisible=true 복원', () => {
      renderingStore.drawGpxRoute(GPX_TWO_POINTS);
      renderingStore.isCourseVisible = false;
      renderingStore.clearGpxRoute();
      expect(renderingStore.isCourseVisible).toBe(true);
    });

    it('clearGpxRoute 후 idle 리스너 제거', () => {
      renderingStore.drawGpxRoute(GPX_TWO_POINTS);
      renderingStore.clearGpxRoute();
      expect(((mockNaverMaps as Record<string, unknown>).Event as { removeListener: ReturnType<typeof vi.fn> }).removeListener)
        .toHaveBeenCalled();
    });
  });

  describe('returnToCourse() (MapRenderingStore)', () => {
    let mockBounds: { extend: ReturnType<typeof vi.fn>; intersects: ReturnType<typeof vi.fn> };
    let renderingStore: MapRenderingStore;

    beforeEach(() => {
      mockBounds = { extend: vi.fn().mockReturnThis(), intersects: vi.fn().mockReturnValue(true) };
      (mockNaverMaps as Record<string, unknown>).LatLngBounds = vi.fn(function () { return mockBounds; });
      (mockNaverMaps as Record<string, unknown>).Event = {
        addListener: vi.fn(() => ({ id: 'idle-listener' })),
        removeListener: vi.fn(),
      };
      mockNaverMaps.Polyline.mockImplementation(function () { return mockPolyline; });
      (window as unknown as Record<string, unknown>).naver = { maps: mockNaverMaps };
      store = new MapStore();
      store.initMap(document.createElement('div'));
      renderingStore = new MapRenderingStore(() => store.map);
    });

    it('gpxBounds가 null이 아닐 때 fitBounds 호출', () => {
      renderingStore.drawGpxRoute(GPX_TWO_POINTS);
      renderingStore.returnToCourse();
      expect(mockMap.fitBounds).toHaveBeenCalledWith(expect.any(Object), { top: 50, right: 50, bottom: 50, left: 50 });
    });

    it('gpxBounds가 null이면 fitBounds 미호출', () => {
      renderingStore.returnToCourse();
      expect(mockMap.fitBounds).not.toHaveBeenCalled();
    });

    it('map이 null이면 fitBounds 미호출', () => {
      const nullRendering = new MapRenderingStore(() => null);
      nullRendering.drawGpxRoute(GPX_TWO_POINTS);
      nullRendering.returnToCourse();
      expect(mockMap.fitBounds).not.toHaveBeenCalled();
    });
  });
});
