import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GroupSettingsPage } from './GroupSettingsPage';
import type { Group } from '../types/group';

const OWNER_ID = 'owner-user-id';

const FAKE_GROUP: Group = {
  id: 'g1',
  name: '테스트 그룹',
  created_by: OWNER_ID,
  gpx_path: 'path/to/file.gpx',
  gpx_bucket: 'gpx-files',
  thumbnail_path: null,
  created_at: '',
  max_members: null,
  period_started_at: null,
  period_ended_at: null,
  distance_m: null,
  elevation_gain_m: null,
  difficulty: null,
};

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    group: undefined as Group | null | undefined,
    currentUserId: null as string | null,
    maxInput: '',
    invites: [] as { id: string; group_id: string; token: string; is_active: boolean; created_at: string }[],
    members: [] as { id: string; group_id: string; user_id: string; joined_at: string }[],
    error: null as string | null,
    load: vi.fn(),
    setMaxInput: vi.fn(),
    createInvite: vi.fn(),
    deactivateInvite: vi.fn(),
    updateMaxMembers: vi.fn(),
  },
}));

vi.mock('../stores/GroupSettingsStore', () => ({
  GroupSettingsStore: vi.fn(function () { return mockStore; }),
}));

const renderSettings = (groupId = 'g1') =>
  render(
    <MemoryRouter initialEntries={[`/group/${groupId}/settings`]}>
      <Routes>
        <Route path="/group/:id/settings" element={<GroupSettingsPage />} />
        <Route path="/group/:id" element={<div>Group Map</div>} />
        <Route path="/group" element={<div>Group List</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('GroupSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.group = FAKE_GROUP;
    mockStore.currentUserId = OWNER_ID;
    mockStore.maxInput = '';
    mockStore.invites = [];
    mockStore.members = [];
    mockStore.error = null;
    mockStore.load.mockResolvedValue(undefined);
    mockStore.createInvite.mockResolvedValue(undefined);
    mockStore.deactivateInvite.mockResolvedValue(undefined);
    mockStore.updateMaxMembers.mockResolvedValue(undefined);
  });

  it('로딩 중에는 스피너 표시', () => {
    mockStore.group = undefined;
    renderSettings();
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('비로그인 상태면 /group/:id로 리다이렉트', async () => {
    mockStore.currentUserId = null;
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Group Map')).toBeInTheDocument();
    });
  });

  it('소유자가 아닌 경우 /group/:id로 리다이렉트', async () => {
    mockStore.currentUserId = 'other-user';
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
      expect(mockStore.createInvite).toHaveBeenCalledWith('g1');
    });
  });

  it('활성 초대 링크가 있으면 비활성화 버튼 표시', async () => {
    mockStore.invites = [
      { id: 'inv-1', group_id: 'g1', token: 'tok-abc', is_active: true, created_at: '' },
    ];
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /비활성화/i })).toBeInTheDocument();
    });
  });

  it('비활성화 버튼 클릭 시 deactivateInvite 호출', async () => {
    mockStore.invites = [
      { id: 'inv-1', group_id: 'g1', token: 'tok-abc', is_active: true, created_at: '' },
    ];
    renderSettings();
    await waitFor(() => screen.getByRole('button', { name: /비활성화/i }));
    fireEvent.click(screen.getByRole('button', { name: /비활성화/i }));
    await waitFor(() => {
      expect(mockStore.deactivateInvite).toHaveBeenCalledWith('inv-1');
    });
  });

  it('멤버 목록 렌더링', async () => {
    mockStore.members = [
      { id: 'm1', group_id: 'g1', user_id: 'u2', joined_at: '2026-01-02T00:00:00Z' },
    ];
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('u2')).toBeInTheDocument();
    });
  });
});
