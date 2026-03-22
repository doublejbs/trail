import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInAction } from 'mobx';
import { TrackingStore } from './TrackingStore';

const {
  mockGetUser, mockInsert, mockProfileSelect,
  mockChannelSubscribe, mockChannelSend, mockRemoveChannel,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockInsert: vi.fn(),
  mockProfileSelect: vi.fn(),
  mockChannelSubscribe: vi.fn(),
  mockChannelSend: vi.fn(),
  mockRemoveChannel: vi.fn(),
}));

const mockChannel = {
  subscribe: () => mockChannelSubscribe(),
  send: (...args: unknown[]) => mockChannelSend(...args),
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: () => mockProfileSelect() }) }),
        };
      }
      return { insert: (...args: unknown[]) => mockInsert(...args) };
    },
    channel: () => mockChannel,
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('TrackingStore', () => {
  let store: TrackingStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    store = new TrackingStore('test-group-id', []);
  });

  afterEach(() => {
    store.dispose();
    vi.useRealTimers();
  });

  describe('초기 상태', () => {
    it('isTracking이 false', () => {
      expect(store.isTracking).toBe(false);
    });

    it('elapsedSeconds가 0', () => {
      expect(store.elapsedSeconds).toBe(0);
    });

    it('distanceMeters가 0', () => {
      expect(store.distanceMeters).toBe(0);
    });

    it('speedKmh가 0', () => {
      expect(store.speedKmh).toBe(0);
    });

    it('points가 빈 배열', () => {
      expect(store.points).toEqual([]);
    });

    it('maxRouteMeters가 0', () => {
      expect(store.maxRouteMeters).toBe(0);
    });
  });

  describe('start()', () => {
    it('isTracking을 true로 설정', () => {
      store.start();
      expect(store.isTracking).toBe(true);
    });

    it('1초마다 elapsedSeconds 증가', () => {
      store.start();
      vi.advanceTimersByTime(3000);
      expect(store.elapsedSeconds).toBe(3);
    });

    it('재호출 시 상태 리셋', () => {
      store.start();
      vi.advanceTimersByTime(5000);
      store.start();
      expect(store.elapsedSeconds).toBe(0);
      expect(store.distanceMeters).toBe(0);
      expect(store.speedKmh).toBe(0);
      expect(store.points).toEqual([]);
    });
  });

  describe('stop()', () => {
    it('isTracking을 false로 설정', () => {
      store.start();
      store.stop();
      expect(store.isTracking).toBe(false);
    });

    it('stop 후 타이머 멈춤 — elapsedSeconds 증가 없음', () => {
      store.start();
      vi.advanceTimersByTime(2000);
      store.stop();
      vi.advanceTimersByTime(3000);
      expect(store.elapsedSeconds).toBe(2);
    });

    it('stop 후 상태 보존 (리셋 안됨)', () => {
      store.start();
      vi.advanceTimersByTime(2000);
      store.stop();
      expect(store.elapsedSeconds).toBe(2);
    });
  });

  describe('dispose()', () => {
    it('dispose 후 타이머 멈춤', () => {
      store.start();
      vi.advanceTimersByTime(2000);
      store.dispose();
      vi.advanceTimersByTime(3000);
      expect(store.elapsedSeconds).toBe(2);
    });

    it('트래킹 중이 아닐 때 dispose 호출해도 에러 없음', () => {
      expect(() => store.dispose()).not.toThrow();
    });
  });

  describe('addPoint()', () => {
    it('isTracking이 false이면 무시', () => {
      store.addPoint(37.5, 126.9);
      expect(store.distanceMeters).toBe(0);
    });

    it('첫 번째 포인트 — distance 0, speed 0', () => {
      store.start();
      store.addPoint(37.5, 126.9);
      expect(store.distanceMeters).toBe(0);
      expect(store.speedKmh).toBe(0);
    });

    it('두 번째 포인트 — distance 누적', () => {
      store.start();
      store.addPoint(37.5, 126.9);
      store.addPoint(37.501, 126.9);
      expect(store.distanceMeters).toBeGreaterThan(0);
    });

    it('두 번째 포인트 — speed 계산', () => {
      store.start();
      const ts1 = Date.now();
      vi.setSystemTime(ts1);
      store.addPoint(37.5, 126.9);
      vi.setSystemTime(ts1 + 1000);
      store.addPoint(37.501, 126.9);
      expect(store.speedKmh).toBeGreaterThan(0);
    });
  });

  describe('computed', () => {
    it('formattedTime — 0초는 "00:00:00"', () => {
      expect(store.formattedTime).toBe('00:00:00');
    });

    it('formattedTime — 3661초는 "01:01:01"', () => {
      store.start();
      vi.advanceTimersByTime(3661000);
      expect(store.formattedTime).toBe('01:01:01');
    });

    it('formattedDistance — 999m는 "999m"', () => {
      store.start();
      runInAction(() => { store.distanceMeters = 999; });
      expect(store.formattedDistance).toBe('999m');
    });

    it('formattedDistance — 1000m는 "1.0km"', () => {
      store.start();
      runInAction(() => { store.distanceMeters = 1000; });
      expect(store.formattedDistance).toBe('1.0km');
    });

    it('formattedDistance — 1500m는 "1.5km"', () => {
      store.start();
      runInAction(() => { store.distanceMeters = 1500; });
      expect(store.formattedDistance).toBe('1.5km');
    });

    it('formattedSpeed — "0.0km/h"', () => {
      expect(store.formattedSpeed).toBe('0.0km/h');
    });

    it('formattedSpeed — speedKmh 반영', () => {
      store.start();
      runInAction(() => { store.speedKmh = 5.67; });
      expect(store.formattedSpeed).toBe('5.7km/h');
    });
  });

  describe('저장 기능', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user-1@test.com' } }, error: null });
      mockInsert.mockResolvedValue({ error: null });
      mockProfileSelect.mockResolvedValue({ data: null });
      mockChannelSubscribe.mockReturnValue(undefined);
      mockChannelSend.mockResolvedValue({});
    });

    it('stop() 후 elapsedSeconds > 0이면 Supabase INSERT 호출', async () => {
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await vi.runAllTimersAsync();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          group_id: 'test-group-id',
          elapsed_seconds: 1,
        })
      );
    });

    it('INSERT에 max_route_meters 포함', async () => {
      store.setRoutePoints([{ lat: 37.5, lng: 126.9 }, { lat: 37.51, lng: 126.9 }]);
      store.start();
      store.addPoint(37.505, 126.9);
      vi.advanceTimersByTime(1000);
      store.stop();
      await vi.runAllTimersAsync();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ max_route_meters: expect.any(Number) })
      );
    });

    it('stop() 후 elapsedSeconds === 0이면 INSERT 미호출', async () => {
      store.start();
      store.stop();
      await vi.runAllTimersAsync();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('저장 중 saving === true', async () => {
      mockInsert.mockImplementation(() => new Promise(() => {}));
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await Promise.resolve();
      expect(store.saving).toBe(true);
    });

    it('저장 성공 후 saving === false', async () => {
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await vi.runAllTimersAsync();
      expect(store.saving).toBe(false);
    });

    it('getUser가 null 반환 시 INSERT 미호출', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await vi.runAllTimersAsync();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('INSERT 실패 시 saveError 설정', async () => {
      mockInsert.mockResolvedValue({ error: { message: '저장 실패' } });
      store.start();
      vi.advanceTimersByTime(1000);
      store.stop();
      await vi.runAllTimersAsync();
      expect(store.saveError).toBe('저장 실패');
    });
  });

  describe('routePoints / maxRouteMeters', () => {
    it('setRoutePoints() 후 addPoint()하면 maxRouteMeters 업데이트', () => {
      store.setRoutePoints([{ lat: 37.5, lng: 126.9 }, { lat: 37.51, lng: 126.9 }]);
      store.start();
      store.addPoint(37.505, 126.9);
      expect(store.maxRouteMeters).toBeGreaterThan(0);
    });

    it('routePoints 빈 배열이면 maxRouteMeters 0 유지', () => {
      store.start();
      store.addPoint(37.5, 126.9);
      store.addPoint(37.501, 126.9);
      expect(store.maxRouteMeters).toBe(0);
    });
  });

  describe('broadcast', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@test.com' } }, error: null });
      mockProfileSelect.mockResolvedValue({ data: { display_name: '홍길동' } });
      mockChannelSubscribe.mockReturnValue(undefined);
      mockChannelSend.mockResolvedValue({});
    });

    it('start() 후 _initBroadcast가 채널 구독', async () => {
      store.start();
      await vi.runAllTimersAsync();
      expect(mockChannelSubscribe).toHaveBeenCalled();
    });

    it('1초 후 채널로 broadcast 전송', async () => {
      store.start();
      await vi.runAllTimersAsync();
      vi.advanceTimersByTime(1000);
      expect(mockChannelSend).toHaveBeenCalled();
    });

    it('dispose() 시 채널 제거', async () => {
      store.start();
      await vi.runAllTimersAsync();
      store.dispose();
      expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it('미인증 시 broadcast 미전송', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      store.start();
      await vi.runAllTimersAsync();
      vi.advanceTimersByTime(1000);
      expect(mockChannelSend).not.toHaveBeenCalled();
    });
  });
});
