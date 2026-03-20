import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('기본 탭은 "내가 만든 그룹"', () => {
    renderGroupPage();
    const ownedTab = screen.getByRole('button', { name: '내가 만든 그룹' });
    expect(ownedTab).toHaveClass('border-black');
  });

  it('"내가 만든 그룹" 탭: created_by === currentUserId 그룹만 표시', async () => {
    mockStore.groups = [
      { id: 'g1', name: '내 그룹', created_by: 'owner-id', gpx_path: '', created_at: '', max_members: null },
      { id: 'g2', name: '남의 그룹', created_by: 'other-user', gpx_path: '', created_at: '', max_members: null },
    ];
    renderGroupPage();
    await waitFor(() => {
      expect(screen.getByText('내 그룹')).toBeInTheDocument();
      expect(screen.queryByText('남의 그룹')).not.toBeInTheDocument();
    });
  });

  it('"참여중인 그룹" 탭: created_by !== currentUserId 그룹만 표시', async () => {
    mockStore.groups = [
      { id: 'g1', name: '내 그룹', created_by: 'owner-id', gpx_path: '', created_at: '', max_members: null },
      { id: 'g2', name: '남의 그룹', created_by: 'other-user', gpx_path: '', created_at: '', max_members: null },
    ];
    renderGroupPage();
    fireEvent.click(screen.getByRole('button', { name: '참여중인 그룹' }));
    await waitFor(() => {
      expect(screen.queryByText('내 그룹')).not.toBeInTheDocument();
      expect(screen.getByText('남의 그룹')).toBeInTheDocument();
    });
  });

  it('"내가 만든 그룹" 탭 비었을 때 전용 empty 메시지', async () => {
    renderGroupPage();
    await waitFor(() => {
      expect(screen.getByText('아직 만든 그룹이 없습니다')).toBeInTheDocument();
    });
  });

  it('"참여중인 그룹" 탭 비었을 때 전용 empty 메시지', async () => {
    renderGroupPage();
    fireEvent.click(screen.getByRole('button', { name: '참여중인 그룹' }));
    await waitFor(() => {
      expect(screen.getByText('아직 참여한 그룹이 없습니다')).toBeInTheDocument();
    });
  });
});
