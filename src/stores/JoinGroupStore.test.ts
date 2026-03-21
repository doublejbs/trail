import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JoinGroupStore } from './JoinGroupStore';

const { mockRpc, mockGetSession } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

describe('JoinGroupStore', () => {
  let store: JoinGroupStore;
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    store = new JoinGroupStore(mockNavigate);
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  });

  describe('초기 상태', () => {
    it('status가 idle', () => expect(store.status).toBe('idle'));
    it('groupId가 null', () => expect(store.groupId).toBeNull());
    it('sessionChecked가 false', () => expect(store.sessionChecked).toBe(false));
    it('isLoggedIn이 false', () => expect(store.isLoggedIn).toBe(false));
  });

  describe('checkAndJoin()', () => {
    it('비로그인 상태면 /login?next=으로 navigate 호출', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      await store.checkAndJoin('tok-abc');
      expect(mockNavigate).toHaveBeenCalledWith(
        `/login?next=${encodeURIComponent('/invite/tok-abc')}`,
        { replace: true }
      );
    });

    it('세션 확인 후 sessionChecked=true, isLoggedIn 설정', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'joined', group_id: 'g1' }, error: null });
      await store.checkAndJoin('tok-abc');
      expect(store.sessionChecked).toBe(true);
      expect(store.isLoggedIn).toBe(true);
    });

    it('joined 응답 시 status=success, groupId 설정 및 navigate 호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'joined', group_id: 'g1' }, error: null });
      await store.checkAndJoin('some-token');
      expect(store.status).toBe('success');
      expect(store.groupId).toBe('g1');
      expect(mockNavigate).toHaveBeenCalledWith('/group/g1', { replace: true });
    });

    it('already_member 응답 시 status=already_member, groupId 설정 및 navigate 호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'already_member', group_id: 'g1' }, error: null });
      await store.checkAndJoin('some-token');
      expect(store.status).toBe('already_member');
      expect(store.groupId).toBe('g1');
      expect(mockNavigate).toHaveBeenCalledWith('/group/g1', { replace: true });
    });

    it('full 응답 시 status=full, navigate 미호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'full' }, error: null });
      await store.checkAndJoin('some-token');
      expect(store.status).toBe('full');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('invalid 응답 시 status=invalid', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'invalid' }, error: null });
      await store.checkAndJoin('some-token');
      expect(store.status).toBe('invalid');
    });

    it('RPC 오류 시 status=invalid', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'network error' } });
      await store.checkAndJoin('some-token');
      expect(store.status).toBe('invalid');
    });

    it('올바른 RPC 이름과 토큰으로 호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'joined', group_id: 'g1' }, error: null });
      await store.checkAndJoin('abc-123');
      expect(mockRpc).toHaveBeenCalledWith('join_group_by_token', { p_token: 'abc-123' });
    });
  });
});
