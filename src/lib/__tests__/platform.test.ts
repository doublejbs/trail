import { describe, it, expect, vi } from 'vitest';

describe('platform', () => {
  it('웹 환경에서 isNative()는 false를 반환한다', async () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
    }));
    const { isNative } = await import('../platform');
    expect(isNative()).toBe(false);
  });
});
