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

  describe('checkAndPreview()', () => {
    it('비로그인 상태면 /login?next=으로 navigate 호출', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      await store.checkAndPreview('tok-abc');
      expect(mockNavigate).toHaveBeenCalledWith(
        `/login?next=${encodeURIComponent('/invite/tok-abc')}`,
        { replace: true },
      );
    });

    it('세션 확인 후 sessionChecked=true, isLoggedIn 설정', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'ready', group_id: 'g1', group_name: 'Test', thumbnail_path: null, gpx_bucket: 'gpx-files', member_count: 1, max_members: 10 }, error: null });
      await store.checkAndPreview('tok-abc');
      expect(store.sessionChecked).toBe(true);
      expect(store.isLoggedIn).toBe(true);
    });

    it('already_member 응답 시 status=already_member, navigate 호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'already_member', group_id: 'g1' }, error: null });
      await store.checkAndPreview('some-token');
      expect(store.status).toBe('already_member');
      expect(store.groupId).toBe('g1');
      expect(mockNavigate).toHaveBeenCalledWith('/group/g1', { replace: true });
    });

    it('full 응답 시 status=full, navigate 미호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'full' }, error: null });
      await store.checkAndPreview('some-token');
      expect(store.status).toBe('full');
      expect(mockNavigate).toHaveBeenCalledTimes(0);
    });

    it('invalid 응답 시 status=invalid', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'invalid' }, error: null });
      await store.checkAndPreview('some-token');
      expect(store.status).toBe('invalid');
    });

    it('RPC 오류 시 status=invalid', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'network error' } });
      await store.checkAndPreview('some-token');
      expect(store.status).toBe('invalid');
    });

    it('ready 응답 시 status=ready, groupPreview 설정', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'ready', group_id: 'g1', group_name: 'Trail', thumbnail_path: null, gpx_bucket: 'gpx-files', member_count: 3, max_members: 10 }, error: null });
      await store.checkAndPreview('tok-abc');
      expect(store.status).toBe('ready');
      expect(store.groupPreview).toEqual({
        id: 'g1',
        name: 'Trail',
        thumbnail_path: null,
        gpx_bucket: 'gpx-files',
        member_count: 3,
        max_members: 10,
      });
    });

    it('올바른 RPC 이름과 토큰으로 호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'ready', group_id: 'g1', group_name: 'Test', thumbnail_path: null, gpx_bucket: 'gpx-files', member_count: 1, max_members: null }, error: null });
      await store.checkAndPreview('abc-123');
      expect(mockRpc).toHaveBeenCalledWith('preview_invite', { p_token: 'abc-123' });
    });
  });

  describe('confirmJoin()', () => {
    beforeEach(async () => {
      mockRpc.mockResolvedValueOnce({ data: { status: 'ready', group_id: 'g1', group_name: 'Trail', thumbnail_path: null, gpx_bucket: 'gpx-files', member_count: 1, max_members: 10 }, error: null });
      await store.checkAndPreview('tok-abc');
      mockNavigate.mockClear();
    });

    it('joined 응답 시 status=success, navigate 호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'joined', group_id: 'g1' }, error: null });
      await store.confirmJoin();
      expect(store.status).toBe('success');
      expect(mockNavigate).toHaveBeenCalledWith('/group/g1', { replace: true });
    });

    it('RPC 오류 시 status=invalid', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
      await store.confirmJoin();
      expect(store.status).toBe('invalid');
    });

    it('올바른 RPC 이름과 토큰으로 호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'joined', group_id: 'g1' }, error: null });
      await store.confirmJoin();
      expect(mockRpc).toHaveBeenCalledWith('join_group_by_token', { p_token: 'tok-abc' });
    });
  });
});
