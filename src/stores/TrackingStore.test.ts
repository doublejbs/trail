import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrackingStore } from './TrackingStore';

const {
  mockGetUser, mockInsert, mockUpdate, mockProfileSelect,
  mockChannelSubscribe, mockChannelSend, mockRemoveChannel,
  mockSelect,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockProfileSelect: vi.fn(),
  mockChannelSubscribe: vi.fn(),
  mockChannelSend: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockSelect: vi.fn(),
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
      return {
        insert: (...args: unknown[]) => mockInsert(...args),
        update: (data: unknown) => ({
          eq: () => mockUpdate(data),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    single: () => mockSelect(),
                    maybeSingle: () => mockSelect(),
                  }),
                }),
              }),
            }),
          }),
        }),
      };
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
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user-1@test.com' } }, error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockUpdate.mockResolvedValue({ error: null });
    mockProfileSelect.mockResolvedValue({ data: null });
    mockChannelSubscribe.mockReturnValue(undefined);
    mockChannelSend.mockResolvedValue({});
    mockSelect.mockResolvedValue({ data: null });
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

    it('points가 빈 배열', () => {
      expect(store.points).toEqual([]);
    });

    it('maxRouteMeters가 0', () => {
      expect(store.maxRouteMeters).toBe(0);
    });
  });

  describe('start()', () => {
    it('isTracking을 true로 설정', async () => {
      await store.start();
      expect(store.isTracking).toBe(true);
    });

    it('DB에 INSERT 호출', async () => {
      await store.start();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          group_id: 'test-group-id',
          status: 'active',
        })
      );
    });
  });

  describe('stop()', () => {
    it('isTracking을 false로 설정', async () => {
      await store.start();
      await store.stop();
      expect(store.isTracking).toBe(false);
    });

    it('DB에 status=completed UPDATE 호출', async () => {
      await store.start();
      await store.stop();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      );
    });
  });

  describe('restart()', () => {
    it('기존 세션을 완료하고 새 세션을 시작', async () => {
      await store.start();
      const firstInsertCount = mockInsert.mock.calls.length;
      await store.restart();
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
      expect(mockInsert.mock.calls.length).toBe(firstInsertCount + 1);
      expect(store.isTracking).toBe(true);
    });
  });

  describe('dispose()', () => {
    it('에러 없이 호출 가능', () => {
      expect(() => store.dispose()).not.toThrow();
    });
  });

  describe('addPoint()', () => {
    it('isTracking이 false이면 무시', () => {
      store.addPoint(37.5, 126.9);
      expect(store.distanceMeters).toBe(0);
    });

    it('첫 번째 포인트 — distance 0', async () => {
      await store.start();
      store.addPoint(37.5, 126.9);
      expect(store.distanceMeters).toBe(0);
    });

    it('두 번째 포인트 — distance 누적', async () => {
      await store.start();
      store.addPoint(37.5, 126.9);
      store.addPoint(37.501, 126.9);
      expect(store.distanceMeters).toBeGreaterThan(0);
    });
  });

  describe('computed', () => {
    it('formattedTime — 0초는 "00:00:00"', () => {
      expect(store.formattedTime).toBe('00:00:00');
    });
  });

  describe('restore()', () => {
    it('active 세션이 있으면 isTracking=true', async () => {
      mockSelect.mockResolvedValue({
        data: { id: 'session-1', status: 'active', max_route_meters: 500, distance_meters: 300, started_at: new Date().toISOString() },
      });
      await store.restore();
      expect(store.isTracking).toBe(true);
    });

    it('세션이 없으면 초기 상태 유지', async () => {
      mockSelect.mockResolvedValue({ data: null });
      await store.restore();
      expect(store.isTracking).toBe(false);
    });
  });

  describe('routePoints / maxRouteMeters', () => {
    it('setRoutePoints() 후 addPoint()하면 maxRouteMeters 업데이트', async () => {
      store.setRoutePoints([{ lat: 37.5, lng: 126.9 }, { lat: 37.51, lng: 126.9 }]);
      await store.start();
      store.addPoint(37.505, 126.9);
      expect(store.maxRouteMeters).toBeGreaterThan(0);
    });

    it('routePoints 빈 배열이면 maxRouteMeters 0 유지', async () => {
      await store.start();
      store.addPoint(37.5, 126.9);
      store.addPoint(37.501, 126.9);
      expect(store.maxRouteMeters).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('start() 후 _initBroadcast가 채널 구독', async () => {
      mockProfileSelect.mockResolvedValue({ data: { display_name: '홍길동' } });
      await store.start();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(mockChannelSubscribe).toHaveBeenCalled();
    });

    it('dispose() 시 채널 제거', async () => {
      mockProfileSelect.mockResolvedValue({ data: { display_name: '홍길동' } });
      await store.start();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      store.dispose();
      expect(mockRemoveChannel).toHaveBeenCalled();
    });
  });
});
