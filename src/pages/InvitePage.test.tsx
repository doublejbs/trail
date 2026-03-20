import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { InvitePage } from './InvitePage';

const { mockStore, mockGetSession } = vi.hoisted(() => ({
  mockStore: {
    status: 'idle' as string,
    groupId: null as string | null,
    joinByToken: vi.fn(),
  },
  mockGetSession: vi.fn(),
}));

vi.mock('../stores/JoinGroupStore', () => ({
  JoinGroupStore: vi.fn(function () { return mockStore; }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

const renderInvite = (token = 'test-token') =>
  render(
    <MemoryRouter initialEntries={[`/invite/${token}`]}>
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/group/:id" element={<div>Group Map</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('InvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = 'idle';
    mockStore.groupId = null;
    mockStore.joinByToken.mockResolvedValue(undefined);
  });

  it('비로그인 상태면 /login?next= 으로 리다이렉트', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('로그인 상태면 joinByToken 호출', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockStore.joinByToken.mockImplementation(() => {
      mockStore.status = 'success';
      mockStore.groupId = 'g1';
      return Promise.resolve();
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(mockStore.joinByToken).toHaveBeenCalledWith('abc-123');
    });
  });

  it('success 상태면 /group/:id로 이동', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockStore.joinByToken.mockImplementation(() => {
      mockStore.status = 'success';
      mockStore.groupId = 'g1';
      return Promise.resolve();
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText('Group Map')).toBeInTheDocument();
    });
  });

  it('already_member 상태면 /group/:id로 이동', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockStore.joinByToken.mockImplementation(() => {
      mockStore.status = 'already_member';
      mockStore.groupId = 'g1';
      return Promise.resolve();
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText('Group Map')).toBeInTheDocument();
    });
  });

  it('invalid 상태면 에러 메시지 표시', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockStore.joinByToken.mockImplementation(() => {
      mockStore.status = 'invalid';
      return Promise.resolve();
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText(/유효하지 않은 초대/i)).toBeInTheDocument();
    });
  });

  it('full 상태면 에러 메시지 표시', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockStore.joinByToken.mockImplementation(() => {
      mockStore.status = 'full';
      return Promise.resolve();
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText(/가득/i)).toBeInTheDocument();
    });
  });
});
