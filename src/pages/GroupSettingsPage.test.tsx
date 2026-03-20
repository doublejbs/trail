import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GroupSettingsPage } from './GroupSettingsPage';

const OWNER_ID = 'owner-user-id';

const { mockInviteStore, mockGetUser, mockGroupSelect } = vi.hoisted(() => ({
  mockInviteStore: {
    invites: [] as { id: string; group_id: string; token: string; is_active: boolean; created_at: string }[],
    members: [] as { id: string; group_id: string; user_id: string; joined_at: string }[],
    loading: false,
    error: null as string | null,
    fetchInvites: vi.fn(),
    fetchMembers: vi.fn(),
    createInvite: vi.fn(),
    deactivateInvite: vi.fn(),
    updateMaxMembers: vi.fn(),
  },
  mockGetUser: vi.fn(),
  mockGroupSelect: vi.fn(),
}));

vi.mock('../stores/GroupInviteStore', () => ({
  GroupInviteStore: vi.fn(function () { return mockInviteStore; }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockGroupSelect(),
        }),
      }),
    }),
  },
}));

const renderSettings = (groupId = 'g1') =>
  render(
    <MemoryRouter initialEntries={[`/group/${groupId}/settings`]}>
      <Routes>
        <Route path="/group/:id/settings" element={<GroupSettingsPage />} />
        <Route path="/group/:id" element={<div>Group Map</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('GroupSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInviteStore.invites = [];
    mockInviteStore.members = [];
    mockInviteStore.loading = false;
    mockInviteStore.error = null;
    mockInviteStore.fetchInvites.mockResolvedValue(undefined);
    mockInviteStore.fetchMembers.mockResolvedValue(undefined);
    mockInviteStore.updateMaxMembers.mockResolvedValue(undefined);
    mockGetUser.mockResolvedValue({ data: { user: { id: OWNER_ID } }, error: null });
    mockGroupSelect.mockResolvedValue({
      data: { id: 'g1', name: '테스트 그룹', created_by: OWNER_ID, gpx_path: 'p', created_at: '', max_members: null },
      error: null,
    });
  });

  it('비로그인 상태면 /group/:id로 리다이렉트', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Group Map')).toBeInTheDocument();
    });
  });

  it('소유자가 아닌 경우 /group/:id로 리다이렉트', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Group Map')).toBeInTheDocument();
    });
  });

  it('소유자인 경우 설정 페이지 표시', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText(/초대 링크/i)).toBeInTheDocument();
    });
  });

  it('초대 링크가 없을 때 생성 버튼 표시', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /링크 생성/i })).toBeInTheDocument();
    });
  });

  it('링크 생성 버튼 클릭 시 createInvite 호출', async () => {
    renderSettings();
    await waitFor(() => screen.getByRole('button', { name: /링크 생성/i }));
    fireEvent.click(screen.getByRole('button', { name: /링크 생성/i }));
    await waitFor(() => {
      expect(mockInviteStore.createInvite).toHaveBeenCalledWith('g1');
    });
  });

  it('활성 초대 링크가 있으면 비활성화 버튼 표시', async () => {
    mockInviteStore.invites = [
      { id: 'inv-1', group_id: 'g1', token: 'tok-abc', is_active: true, created_at: '' },
    ];
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /비활성화/i })).toBeInTheDocument();
    });
  });

  it('비활성화 버튼 클릭 시 deactivateInvite 호출', async () => {
    mockInviteStore.invites = [
      { id: 'inv-1', group_id: 'g1', token: 'tok-abc', is_active: true, created_at: '' },
    ];
    renderSettings();
    await waitFor(() => screen.getByRole('button', { name: /비활성화/i }));
    fireEvent.click(screen.getByRole('button', { name: /비활성화/i }));
    await waitFor(() => {
      expect(mockInviteStore.deactivateInvite).toHaveBeenCalledWith('inv-1');
    });
  });

  it('멤버 목록 렌더링', async () => {
    mockInviteStore.members = [
      { id: 'm1', group_id: 'g1', user_id: 'u2', joined_at: '2026-01-02T00:00:00Z' },
    ];
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('u2')).toBeInTheDocument();
    });
  });
});
