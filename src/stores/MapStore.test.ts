import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapStore } from './MapStore';

const mockMap = { setCenter: vi.fn() };
const mockNaverMaps = {
  Map: vi.fn(function () { return mockMap; }),
  LatLng: vi.fn(function (lat: number, lng: number) { return { lat, lng }; }),
};

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
});
