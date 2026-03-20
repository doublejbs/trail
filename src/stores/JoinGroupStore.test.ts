import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JoinGroupStore } from './JoinGroupStore';

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

describe('JoinGroupStore', () => {
  let store: JoinGroupStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new JoinGroupStore();
  });

  describe('초기 상태', () => {
    it('status가 idle', () => expect(store.status).toBe('idle'));
    it('groupId가 null', () => expect(store.groupId).toBeNull());
  });

  describe('joinByToken()', () => {
    it('joined 응답 시 status=success, groupId 설정', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'joined', group_id: 'g1' }, error: null });
      await store.joinByToken('some-token');
      expect(store.status).toBe('success');
      expect(store.groupId).toBe('g1');
    });

    it('already_member 응답 시 status=already_member, groupId 설정', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'already_member', group_id: 'g1' }, error: null });
      await store.joinByToken('some-token');
      expect(store.status).toBe('already_member');
      expect(store.groupId).toBe('g1');
    });

    it('full 응답 시 status=full', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'full' }, error: null });
      await store.joinByToken('some-token');
      expect(store.status).toBe('full');
      expect(store.groupId).toBeNull();
    });

    it('invalid 응답 시 status=invalid', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'invalid' }, error: null });
      await store.joinByToken('some-token');
      expect(store.status).toBe('invalid');
    });

    it('RPC 오류 시 status=invalid', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'network error' } });
      await store.joinByToken('some-token');
      expect(store.status).toBe('invalid');
    });

    it('올바른 RPC 이름과 토큰으로 호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'joined', group_id: 'g1' }, error: null });
      await store.joinByToken('abc-123');
      expect(mockRpc).toHaveBeenCalledWith('join_group_by_token', { p_token: 'abc-123' });
    });

    it('호출 중 status=loading', async () => {
      let statusDuringCall: string | undefined;
      mockRpc.mockImplementation(() => {
        statusDuringCall = store.status;
        return Promise.resolve({ data: { status: 'joined', group_id: 'g1' }, error: null });
      });
      await store.joinByToken('abc-123');
      expect(statusDuringCall).toBe('loading');
    });
  });
});
