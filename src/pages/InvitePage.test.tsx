import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { observable, runInAction } from 'mobx';
import { InvitePage } from './InvitePage';

const mockCheckAndJoin = vi.fn();
let capturedNavigate: (to: string, opts?: object) => void;

const mockStore = observable({
  status: 'idle' as string,
  groupId: null as string | null,
  sessionChecked: false,
  isLoggedIn: false,
  checkAndJoin: mockCheckAndJoin,
});

vi.mock('../stores/JoinGroupStore', () => ({
  JoinGroupStore: vi.fn(function (navigate: (to: string, opts?: object) => void) {
    capturedNavigate = navigate;
    return mockStore;
  }),
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
    mockCheckAndJoin.mockReset();
    mockCheckAndJoin.mockResolvedValue(undefined);
    runInAction(() => {
      mockStore.status = 'idle';
      mockStore.groupId = null;
      mockStore.sessionChecked = false;
      mockStore.isLoggedIn = false;
    });
  });

  it('비로그인 상태면 /login?next= 으로 리다이렉트', async () => {
    mockCheckAndJoin.mockImplementation(async () => {
      runInAction(() => {
        mockStore.sessionChecked = true;
        mockStore.isLoggedIn = false;
      });
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('로그인 상태면 checkAndJoin 호출', async () => {
    mockCheckAndJoin.mockImplementation(async () => {
      runInAction(() => {
        mockStore.sessionChecked = true;
        mockStore.isLoggedIn = true;
        mockStore.status = 'success';
        mockStore.groupId = 'g1';
      });
      capturedNavigate(`/group/g1`, { replace: true });
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(mockCheckAndJoin).toHaveBeenCalledWith('abc-123');
    });
  });

  it('success 상태면 /group/:id로 이동', async () => {
    mockCheckAndJoin.mockImplementation(async () => {
      runInAction(() => {
        mockStore.sessionChecked = true;
        mockStore.isLoggedIn = true;
        mockStore.status = 'success';
        mockStore.groupId = 'g1';
      });
      capturedNavigate(`/group/g1`, { replace: true });
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText('Group Map')).toBeInTheDocument();
    });
  });

  it('already_member 상태면 /group/:id로 이동', async () => {
    mockCheckAndJoin.mockImplementation(async () => {
      runInAction(() => {
        mockStore.sessionChecked = true;
        mockStore.isLoggedIn = true;
        mockStore.status = 'already_member';
        mockStore.groupId = 'g1';
      });
      capturedNavigate(`/group/g1`, { replace: true });
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText('Group Map')).toBeInTheDocument();
    });
  });

  it('invalid 상태면 에러 메시지 표시', async () => {
    mockCheckAndJoin.mockImplementation(async () => {
      runInAction(() => {
        mockStore.sessionChecked = true;
        mockStore.isLoggedIn = true;
        mockStore.status = 'invalid';
      });
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText(/유효하지 않은 초대/i)).toBeInTheDocument();
    });
  });

  it('full 상태면 에러 메시지 표시', async () => {
    mockCheckAndJoin.mockImplementation(async () => {
      runInAction(() => {
        mockStore.sessionChecked = true;
        mockStore.isLoggedIn = true;
        mockStore.status = 'full';
      });
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText(/가득/i)).toBeInTheDocument();
    });
  });
});
