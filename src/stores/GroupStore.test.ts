import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupStore } from './GroupStore';

const { mockGetUser, mockOrder } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockOrder: vi.fn(),
}));

const { mockMemberSelect } = vi.hoisted(() => ({
  mockMemberSelect: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (table: string) => {
      if (table === 'group_members') {
        return {
          select: () => ({
            eq: () => mockMemberSelect(),
            in: () => ({
              order: () => mockMemberSelect(),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [] }),
          }),
        };
      }
      return {
        select: () => ({
          order: (...args: unknown[]) => mockOrder(...args),
        }),
      };
    },
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: null }),
      }),
    },
  },
}));

const FAKE_USER_ID = 'user-abc-123';

const makeGroup = (id: string) => ({
  id,
  name: `Group ${id}`,
  created_by: FAKE_USER_ID,
  gpx_path: `${FAKE_USER_ID}/${id}.gpx`,
  created_at: '2026-01-01T00:00:00Z',
  max_members: null,
});

describe('GroupStore', () => {
  let store: GroupStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: FAKE_USER_ID } }, error: null });
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockMemberSelect.mockResolvedValue({ data: [] });
    store = new GroupStore();
  });

  describe('초기 상태', () => {
    it('groups가 빈 배열', () => expect(store.groups).toEqual([]));
    it('loading이 true', () => expect(store.loading).toBe(true));
    it('error가 false', () => expect(store.error).toBe(false));
    it('currentUserId가 null', () => expect(store.currentUserId).toBeNull());
  });

  describe('load()', () => {
    it('성공 시 groups 설정 및 loading=false', async () => {
      const fakeGroups = [makeGroup('g1')];
      mockOrder.mockResolvedValue({ data: fakeGroups, error: null });

      await store.load();

      expect(store.groups).toEqual([expect.objectContaining({ id: 'g1', name: 'Group g1' })]);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(false);
    });

    it('성공 시 currentUserId 설정', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });
      await store.load();
      expect(store.currentUserId).toBe(FAKE_USER_ID);
    });

    it('DB 오류 시 error=true 및 loading=false', async () => {
      mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });
      await store.load();
      expect(store.error).toBe(true);
      expect(store.loading).toBe(false);
      expect(store.groups).toEqual([]);
    });

    it('두 번째 load() 호출 시 loading=true로 리셋', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });
      await store.load();
      expect(store.loading).toBe(false);

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
