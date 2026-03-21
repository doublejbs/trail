import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GroupMapPage } from './GroupMapPage';
import type { Group } from '../types/group';

const FAKE_GROUP: Group = {
  id: 'group-uuid-1',
  name: '한라산 팀',
  created_by: 'user-1',
  gpx_path: 'user-1/group-uuid-1.gpx',
  created_at: '2026-01-01T00:00:00Z',
  max_members: null,
};

const FAKE_GPX = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="37.5" lon="126.9"></trkpt></trkseg></trk></gpx>`;

const { mockMapStore, mockNavigate } = vi.hoisted(() => ({
  mockMapStore: {
    map: null as naver.maps.Map | null,
    error: false,
    gpxPolyline: null,
    isCourseVisible: true,
    initMap: vi.fn(),
    destroy: vi.fn(),
    locate: vi.fn(),
    drawGpxRoute: vi.fn(),
    clearGpxRoute: vi.fn(),
    startWatchingLocation: vi.fn(),
    returnToCourse: vi.fn(),
  },
  mockNavigate: vi.fn(),
}));

const { mockGroupMapStore } = vi.hoisted(() => ({
  mockGroupMapStore: {
    group: undefined as Group | null | undefined,
    gpxText: undefined as string | null | undefined,
    currentUserId: null as string | null,
    load: vi.fn(() => () => {}),
  },
}));

vi.mock('../stores/MapStore', () => ({
  MapStore: vi.fn(function () { return mockMapStore; }),
}));

vi.mock('../stores/GroupMapStore', () => ({
  GroupMapStore: vi.fn(function () { return mockGroupMapStore; }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/group/:id" element={<GroupMapPage />} />
        <Route path="/group" element={<div>group list</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('GroupMapPage', () => {
  beforeEach(() => {
    mockMapStore.map = null;
    mockMapStore.error = false;
    vi.clearAllMocks();
    mockGroupMapStore.group = FAKE_GROUP;
    mockGroupMapStore.gpxText = FAKE_GPX;
    mockGroupMapStore.currentUserId = 'user-1';
    mockGroupMapStore.load.mockReturnValue(() => {});
  });

  it('그룹을 찾지 못하면 /group으로 리다이렉트', async () => {
    mockGroupMapStore.group = null;
    renderAt('/group/nonexistent-id');
    await waitFor(() => {
      expect(screen.getByText('group list')).toBeInTheDocument();
    });
  });

  it('그룹 로딩 중 스피너 표시', () => {
    mockGroupMapStore.group = undefined;
    mockGroupMapStore.gpxText = undefined;
    renderAt('/group/group-uuid-1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('그룹 로드 후 map-container 렌더링', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });

  it('뒤로가기 버튼에 그룹명 표시', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /한라산 팀/ })).toBeInTheDocument();
    });
  });

  it('뒤로가기 버튼 클릭 시 navigate("/group") 호출', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => screen.getByRole('button', { name: /한라산 팀/ }));
    fireEvent.click(screen.getByRole('button', { name: /한라산 팀/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/group');
  });

  it('지도 로드 후 startWatchingLocation 호출', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(mockMapStore.startWatchingLocation).toHaveBeenCalledOnce();
    });
  });

  it('로드 성공 후 drawGpxRoute 호출', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(mockMapStore.drawGpxRoute).toHaveBeenCalledWith(FAKE_GPX);
    });
  });

  describe('소유자 vs 멤버 UI', () => {
    it('소유자에게 설정 링크 표시 (created_by 일치)', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /설정/i })).toBeInTheDocument();
      });
    });

    it('멤버에게 설정 링크 숨김 (created_by 불일치)', async () => {
      mockGroupMapStore.currentUserId = 'other-user';
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });
      expect(screen.queryByRole('link', { name: /설정/i })).not.toBeInTheDocument();
    });
  });

  describe('코스로 돌아가기 버튼', () => {
    it('isCourseVisible이 false이면 버튼 표시', async () => {
      mockMapStore.map = {} as naver.maps.Map;
      mockMapStore.isCourseVisible = false;
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /코스로 돌아가기/ })).toBeInTheDocument();
      });
    });

    it('isCourseVisible이 true이면 버튼 미표시', async () => {
      mockMapStore.map = {} as naver.maps.Map;
      mockMapStore.isCourseVisible = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /코스로 돌아가기/ })).not.toBeInTheDocument();
    });

    it('버튼 클릭 시 returnToCourse 호출', async () => {
      mockMapStore.map = {} as naver.maps.Map;
      mockMapStore.isCourseVisible = false;
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /코스로 돌아가기/ })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /코스로 돌아가기/ }));
      expect(mockMapStore.returnToCourse).toHaveBeenCalledOnce();
    });
  });
});
