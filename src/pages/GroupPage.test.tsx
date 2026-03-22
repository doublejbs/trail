import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { observable, action } from 'mobx';
import { GroupPage } from './GroupPage';

type Group = { id: string; name: string; created_by: string; gpx_path: string; created_at: string; max_members: null };

const mockLoad = vi.fn();

const mockStore = observable({
  groups: [] as Group[],
  loading: false,
  error: false,
  currentUserId: 'owner-id' as string | null,
  activeTab: 'owned' as 'owned' | 'joined',
  load: mockLoad,
  setActiveTab: action(function (tab: 'owned' | 'joined') {
    mockStore.activeTab = tab;
  }),
});

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
    mockStore.activeTab = 'owned';
  });

  it('기본 탭은 "내가 만든 그룹"', () => {
    renderGroupPage();
    const ownedTab = screen.getByRole('button', { name: '내가 만든' });
    expect(ownedTab).toHaveAttribute('aria-pressed', 'true');
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
    fireEvent.click(screen.getByRole('button', { name: '참여중' }));
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
    fireEvent.click(screen.getByRole('button', { name: '참여중' }));
    await waitFor(() => {
      expect(screen.getByText('아직 참여한 그룹이 없습니다')).toBeInTheDocument();
    });
  });

  it('그룹 Large Title이 h1으로 렌더링된다', () => {
    renderGroupPage();
    expect(screen.getByRole('heading', { name: '그룹', level: 1 })).toBeInTheDocument();
  });

  it('currentUserId가 null이면 "참여중인 그룹"에 모든 그룹이 표시됨', async () => {
    mockStore.currentUserId = null;
    mockStore.groups = [
      { id: 'g1', name: '내 그룹', created_by: 'owner-id', gpx_path: '', created_at: '', max_members: null },
      { id: 'g2', name: '남의 그룹', created_by: 'other-user', gpx_path: '', created_at: '', max_members: null },
    ];
    renderGroupPage();
    fireEvent.click(screen.getByRole('button', { name: '참여중' }));
    await waitFor(() => {
      expect(screen.getByText('내 그룹')).toBeInTheDocument();
      expect(screen.getByText('남의 그룹')).toBeInTheDocument();
    });
  });
});
