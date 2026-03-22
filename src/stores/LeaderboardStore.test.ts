import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardStore } from './LeaderboardStore';

const { mockQuerySessions, mockQueryProfiles, mockChannelSubscribe, mockRemoveChannel } = vi.hoisted(() => ({
  mockQuerySessions: vi.fn(),
  mockQueryProfiles: vi.fn(),
  mockChannelSubscribe: vi.fn(),
  mockRemoveChannel: vi.fn(),
}));

let _broadcastHandler: ((msg: { payload: unknown }) => void) | null = null;

vi.mock('../lib/supabase', () => {
  const makeChain = (resolver: () => Promise<unknown>) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      in: () => chain,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        resolver().then(resolve, reject),
      catch: (reject: (e: unknown) => unknown) => resolver().catch(reject),
    };
    return chain;
  };

  const mockChannel = {
    on: (_type: string, _filter: unknown, cb: (msg: { payload: unknown }) => void) => {
      _broadcastHandler = cb;
      return mockChannel;
    },
    subscribe: () => { mockChannelSubscribe(); return mockChannel; },
  };

  return {
    supabase: {
      from: (table: string) =>
        makeChain(table === 'profiles' ? mockQueryProfiles : mockQuerySessions),
      channel: () => mockChannel,
      removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    },
  };
});

function triggerBroadcast(payload: unknown) {
  _broadcastHandler?.({ payload });
}

describe('LeaderboardStore', () => {
  let store: LeaderboardStore;

  beforeEach(() => {
    vi.clearAllMocks();
    _broadcastHandler = null;
    store = new LeaderboardStore('group-1');
    mockQuerySessions.mockResolvedValue({ data: [], error: null });
    mockQueryProfiles.mockResolvedValue({ data: [], error: null });
    mockChannelSubscribe.mockReturnValue(undefined);
  });

  describe('초기 상태', () => {
    it('rankings가 빈 배열', () => {
      expect(store.rankings).toEqual([]);
    });

    it('loading이 false', () => {
      expect(store.loading).toBe(false);
    });

    it('error가 null', () => {
      expect(store.error).toBeNull();
    });
  });

  describe('load()', () => {
    it('세션 없으면 rankings 빈 배열', async () => {
      await store.load(null);
      expect(store.rankings).toEqual([]);
      expect(store.loading).toBe(false);
    });

    it('세션 있으면 user_id별 max 집계해 rankings 설정', async () => {
      mockQuerySessions.mockResolvedValue({
        data: [
          { user_id: 'u1', max_route_meters: 100 },
          { user_id: 'u1', max_route_meters: 200 },
          { user_id: 'u2', max_route_meters: 150 },
        ],
        error: null,
      });
      mockQueryProfiles.mockResolvedValue({
        data: [
          { id: 'u1', display_name: '김철수' },
          { id: 'u2', display_name: '이영희' },
        ],
        error: null,
      });
      await store.load(null);
      expect(store.rankings).toHaveLength(2);
      expect(store.rankings[0]).toMatchObject({ userId: 'u1', maxRouteMeters: 200, displayName: '김철수' });
      expect(store.rankings[1]).toMatchObject({ userId: 'u2', maxRouteMeters: 150, displayName: '이영희' });
    });

    it('프로필 없는 유저는 "알 수 없음" 표시', async () => {
      mockQuerySessions.mockResolvedValue({
        data: [{ user_id: 'u1', max_route_meters: 100 }],
        error: null,
      });
      await store.load(null);
      expect(store.rankings[0].displayName).toBe('알 수 없음');
    });

    it('maxRouteMeters 내림차순 정렬', async () => {
      mockQuerySessions.mockResolvedValue({
        data: [
          { user_id: 'u2', max_route_meters: 50 },
          { user_id: 'u1', max_route_meters: 200 },
        ],
        error: null,
      });
      await store.load(null);
      expect(store.rankings[0].userId).toBe('u1');
      expect(store.rankings[1].userId).toBe('u2');
    });

    it('Realtime 채널 구독', async () => {
      await store.load(null);
      expect(mockChannelSubscribe).toHaveBeenCalled();
    });

    it('재호출 시 기존 채널 정리 후 재구독', async () => {
      await store.load(null);
      await store.load(null);
      expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
      expect(mockChannelSubscribe).toHaveBeenCalledTimes(2);
    });
  });

  describe('broadcast 수신', () => {
    beforeEach(async () => {
      await store.load(null);
    });

    it('새 유저 broadcast → rankings에 추가', () => {
      triggerBroadcast({ userId: 'u1', displayName: '홍길동', maxRouteMeters: 300 });
      expect(store.rankings).toHaveLength(1);
      expect(store.rankings[0]).toMatchObject({ userId: 'u1', maxRouteMeters: 300, isLive: true });
    });

    it('기존 유저 broadcast → maxRouteMeters 업데이트', async () => {
      mockQuerySessions.mockResolvedValue({
        data: [{ user_id: 'u1', max_route_meters: 100 }],
        error: null,
      });
      mockQueryProfiles.mockResolvedValue({ data: [{ id: 'u1', display_name: '홍길동' }], error: null });
      await store.load(null);

      triggerBroadcast({ userId: 'u1', displayName: '홍길동', maxRouteMeters: 500 });
      expect(store.rankings[0].maxRouteMeters).toBe(500);
      expect(store.rankings[0].isLive).toBe(true);
    });

    it('broadcast 후 내림차순 재정렬', () => {
      triggerBroadcast({ userId: 'u2', displayName: 'B', maxRouteMeters: 100 });
      triggerBroadcast({ userId: 'u1', displayName: 'A', maxRouteMeters: 300 });
      expect(store.rankings[0].userId).toBe('u1');
    });
  });

  describe('dispose()', () => {
    it('채널이 있으면 removeChannel 호출', async () => {
      await store.load(null);
      store.dispose();
      expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it('채널 없이 dispose해도 에러 없음', () => {
      expect(() => store.dispose()).not.toThrow();
    });
  });
});
