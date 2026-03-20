import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupInviteStore } from './GroupInviteStore';

const { mockSelect, mockInsert, mockUpdate, mockUpdateGroups, mockSelectMembers } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateGroups: vi.fn(),
  mockSelectMembers: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'group_members') {
        return {
          select: () => ({
            eq: () => mockSelectMembers(),
          }),
        };
      }
      if (table === 'groups') {
        return {
          update: (...args: unknown[]) => ({
            eq: (...eqArgs: unknown[]) => mockUpdateGroups(...args, ...eqArgs),
          }),
        };
      }
      // group_invites table
      return {
        select: () => ({
          eq: () => ({
            order: (...args: unknown[]) => mockSelect(...args),
          }),
        }),
        insert: (...args: unknown[]) => ({
          select: () => mockInsert(...args),
        }),
        update: (...args: unknown[]) => ({
          eq: (...eqArgs: unknown[]) => mockUpdate(...args, ...eqArgs),
        }),
      };
    },
  },
}));

const FAKE_INVITE = {
  id: 'inv-1',
  group_id: 'g1',
  token: 'tok-abc',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

const FAKE_MEMBER = {
  id: 'mem-1',
  group_id: 'g1',
  user_id: 'u2',
  joined_at: '2026-01-02T00:00:00Z',
};

describe('GroupInviteStore', () => {
  let store: GroupInviteStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue({ data: [], error: null });
    mockSelectMembers.mockResolvedValue({ data: [], error: null });
    mockInsert.mockResolvedValue({ data: [FAKE_INVITE], error: null });
    mockUpdate.mockResolvedValue({ data: null, error: null });
    store = new GroupInviteStore();
  });

  describe('초기 상태', () => {
    it('invites가 빈 배열', () => expect(store.invites).toEqual([]));
    it('members가 빈 배열', () => expect(store.members).toEqual([]));
    it('loading이 false', () => expect(store.loading).toBe(false));
    it('error가 null', () => expect(store.error).toBeNull());
  });

  describe('fetchInvites()', () => {
    it('성공 시 invites 설정', async () => {
      mockSelect.mockResolvedValue({ data: [FAKE_INVITE], error: null });
      await store.fetchInvites('g1');
      expect(store.invites).toEqual([FAKE_INVITE]);
    });

    it('실패 시 error 설정', async () => {
      mockSelect.mockResolvedValue({ data: null, error: { message: 'DB error' } });
      await store.fetchInvites('g1');
      expect(store.error).toBe('DB error');
    });
  });

  describe('fetchMembers()', () => {
    it('성공 시 members 설정', async () => {
      mockSelectMembers.mockResolvedValue({ data: [FAKE_MEMBER], error: null });
      await store.fetchMembers('g1');
      expect(store.members).toEqual([FAKE_MEMBER]);
    });

    it('실패 시 error 설정', async () => {
      mockSelectMembers.mockResolvedValue({ data: null, error: { message: 'fetch error' } });
      await store.fetchMembers('g1');
      expect(store.error).toBe('fetch error');
    });
  });

  describe('createInvite()', () => {
    it('성공 시 invites에 추가', async () => {
      mockInsert.mockResolvedValue({ data: [FAKE_INVITE], error: null });
      await store.createInvite('g1');
      expect(store.invites).toContainEqual(FAKE_INVITE);
    });

    it('실패 시 error 설정', async () => {
      mockInsert.mockResolvedValue({ data: null, error: { message: 'insert error' } });
      await store.createInvite('g1');
      expect(store.error).toBe('insert error');
    });
  });

  describe('deactivateInvite()', () => {
    it('성공 시 해당 invite의 is_active를 false로 업데이트', async () => {
      store.invites = [FAKE_INVITE];
      await store.deactivateInvite('inv-1');
      expect(store.invites[0].is_active).toBe(false);
    });

    it('실패 시 error 설정', async () => {
      mockUpdate.mockResolvedValue({ error: { message: 'update error' } });
      await store.deactivateInvite('inv-1');
      expect(store.error).toBe('update error');
    });
  });

  describe('updateMaxMembers()', () => {
    it('성공 시 groups 테이블 직접 업데이트', async () => {
      mockUpdateGroups.mockResolvedValue({ error: null });
      await store.updateMaxMembers('g1', 10);
      // mock receives spread args: update({ max_members }) then eq('id', groupId)
      expect(mockUpdateGroups).toHaveBeenCalledWith({ max_members: 10 }, 'id', 'g1');
    });

    it('null로 제한 해제 가능', async () => {
      mockUpdateGroups.mockResolvedValue({ error: null });
      await store.updateMaxMembers('g1', null);
      expect(mockUpdateGroups).toHaveBeenCalledWith({ max_members: null }, 'id', 'g1');
    });
  });
});
