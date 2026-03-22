import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileStore } from './ProfileStore';
import { toast } from 'sonner';

const { mockGetUser, mockSelectProfile, mockUpsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectProfile: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: () => mockSelectProfile() }) }),
          upsert: (...args: unknown[]) => mockUpsert(...args),
        };
      }
      return {};
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('ProfileStore', () => {
  let store: ProfileStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new ProfileStore();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  describe('초기 상태', () => {
    it('displayName이 ""', () => {
      expect(store.displayName).toBe('');
    });

    it('loading이 false', () => {
      expect(store.loading).toBe(false);
    });

    it('saving이 false', () => {
      expect(store.saving).toBe(false);
    });
  });

  describe('load()', () => {
    it('프로필 있으면 displayName 설정', async () => {
      mockSelectProfile.mockResolvedValue({ data: { display_name: '홍길동' }, error: null });
      await store.load();
      expect(store.displayName).toBe('홍길동');
    });

    it('프로필 없으면 displayName 빈 문자열', async () => {
      mockSelectProfile.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      await store.load();
      expect(store.displayName).toBe('');
    });
  });

  describe('save()', () => {
    it('upsert 호출', async () => {
      mockUpsert.mockResolvedValue({ error: null });
      await store.save('테스트이름');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: '테스트이름' }),
        expect.anything()
      );
    });

    it('성공 시 displayName 업데이트 + toast.success', async () => {
      mockUpsert.mockResolvedValue({ error: null });
      await store.save('새이름');
      expect(store.displayName).toBe('새이름');
      expect(toast.success).toHaveBeenCalled();
    });

    it('실패 시 toast.error', async () => {
      mockUpsert.mockResolvedValue({ error: { message: '저장 실패' } });
      await store.save('이름');
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
