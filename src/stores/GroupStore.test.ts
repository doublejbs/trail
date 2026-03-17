import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupStore } from './GroupStore';

const { mockOrder } = vi.hoisted(() => ({
  mockOrder: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: (...args: unknown[]) => mockOrder(...args),
      }),
    }),
  },
}));

describe('GroupStore', () => {
  let store: GroupStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new GroupStore();
  });

  describe('초기 상태', () => {
    it('groups가 빈 배열', () => {
      expect(store.groups).toEqual([]);
    });

    it('loading이 true', () => {
      expect(store.loading).toBe(true);
    });

    it('error가 false', () => {
      expect(store.error).toBe(false);
    });
  });

  describe('load()', () => {
    it('성공 시 groups 설정 및 loading=false', async () => {
      const fakeGroups = [
        { id: 'g1', name: '한라산 팀', created_by: 'u1', gpx_path: 'u1/g1.gpx', created_at: '2026-01-01T00:00:00Z' },
      ];
      mockOrder.mockResolvedValue({ data: fakeGroups, error: null });

      await store.load();

      expect(store.groups).toEqual(fakeGroups);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(false);
    });

    it('실패 시 error=true 및 loading=false', async () => {
      mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

      await store.load();

      expect(store.error).toBe(true);
      expect(store.loading).toBe(false);
      expect(store.groups).toEqual([]);
    });

    it('두 번째 load() 호출 시 loading=true로 리셋', async () => {
      // 첫 번째 load() 완료 → loading이 false가 됨을 확인
      mockOrder.mockResolvedValue({ data: [], error: null });
      await store.load();
      expect(store.loading).toBe(false);

      // 두 번째 load() 시작 시 loading이 true로 리셋되는지 확인
      let loadingDuringFetch: boolean | undefined;
      mockOrder.mockImplementation(() => {
        loadingDuringFetch = store.loading;
        return Promise.resolve({ data: [], error: null });
      });
      await store.load();
      expect(loadingDuringFetch).toBe(true);
    });

    it('created_at 내림차순 정렬로 조회', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });
      await store.load();
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });
});
