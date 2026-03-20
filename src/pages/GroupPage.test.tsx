import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GroupPage } from './GroupPage';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    groups: [] as { id: string; name: string; created_by: string; gpx_path: string; created_at: string; max_members: null }[],
    loading: false,
    error: false,
    currentUserId: 'owner-id',
    load: vi.fn(),
  },
}));

vi.mock('../stores/GroupStore', () => ({
  GroupStore: vi.fn(function () { return mockStore; }),
}));

const renderGroupPage = () =>
  render(
    <MemoryRouter initialEntries={['/group']}>
      <Routes>
        <Route path="/group" element={<GroupPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('GroupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.loading = false;
    mockStore.error = false;
    mockStore.currentUserId = 'owner-id';
    mockStore.groups = [];
  });

  it('소유자 그룹에 소유자 배지 표시', async () => {
    mockStore.groups = [
      { id: 'g1', name: '내 그룹', created_by: 'owner-id', gpx_path: '', created_at: '', max_members: null },
    ];
    renderGroupPage();
    await waitFor(() => {
      expect(screen.getByText('소유자')).toBeInTheDocument();
    });
  });

  it('멤버 그룹에 멤버 배지 표시', async () => {
    mockStore.groups = [
      { id: 'g2', name: '남의 그룹', created_by: 'other-user', gpx_path: '', created_at: '', max_members: null },
    ];
    renderGroupPage();
    await waitFor(() => {
      expect(screen.getByText('멤버')).toBeInTheDocument();
    });
  });
});
