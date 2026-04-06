import { describe, it, expect, vi, beforeEach } from 'vitest';

// 기본적으로 웹 환경으로 mock
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    requestPermissions: vi.fn().mockResolvedValue({ location: 'granted' }),
    watchPosition: vi.fn().mockResolvedValue('native-watch-1'),
    getCurrentPosition: vi.fn().mockResolvedValue({
      coords: { latitude: 37.5, longitude: 127.0 },
    }),
    clearWatch: vi.fn(),
  },
}));

describe('geolocation (웹 환경)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getCurrentPosition은 좌표를 반환한다', async () => {
    // navigator.geolocation mock
    const mockGetCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 37.5, longitude: 127.0 } });
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { geolocation: { getCurrentPosition: mockGetCurrentPosition } },
      writable: true,
    });

    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));

    const { getCurrentPosition } = await import('../geolocation');
    const pos = await getCurrentPosition();
    expect(pos.latitude).toBe(37.5);
    expect(pos.longitude).toBe(127.0);
  });
});
