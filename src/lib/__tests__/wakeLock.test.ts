import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: {
    keepAwake: vi.fn().mockResolvedValue(undefined),
    allowSleep: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('wakeLock (웹 환경)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('acquireWakeLock은 에러 없이 실행된다', async () => {
    const mockRequest = vi.fn().mockResolvedValue({ release: vi.fn() });
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: mockRequest } },
      writable: true,
    });

    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));

    const { acquireWakeLock } = await import('../wakeLock');
    await expect(acquireWakeLock()).resolves.not.toThrow();
    expect(mockRequest).toHaveBeenCalledWith('screen');
  });

  it('releaseWakeLock은 에러 없이 실행된다', async () => {
    const releaseFn = vi.fn().mockResolvedValue(undefined);
    const mockRequest = vi.fn().mockResolvedValue({ release: releaseFn });
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: mockRequest } },
      writable: true,
    });

    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));

    const { acquireWakeLock, releaseWakeLock } = await import('../wakeLock');
    await acquireWakeLock();
    await releaseWakeLock();
    expect(releaseFn).toHaveBeenCalled();
  });
});
