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
  gpx_bucket: 'gpx-files',
  created_at: '2026-01-01T00:00:00Z',
  max_members: null,
  period_started_at: null,
  period_ended_at: null,
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
    isPeriodActive: false,
    periodStartedAt: null as Date | null,
    periodEndedAt: null as Date | null,
    startPeriod: vi.fn(),
    endPeriod: vi.fn(),
    subscribeToPeriodEvents: vi.fn(() => () => {}),
  },
}));

vi.mock('../stores/MapStore', () => ({
  MapStore: vi.fn(function () { return mockMapStore; }),
}));

vi.mock('../stores/GroupMapStore', () => ({
  GroupMapStore: vi.fn(function () { return mockGroupMapStore; }),
}));

const { mockTrackingStore } = vi.hoisted(() => ({
  mockTrackingStore: {
    isTracking: false,
    isPaused: false,
    elapsedSeconds: 0,
    distanceMeters: 0,
    speedKmh: 0,
    formattedTime: '00:00:00',
    formattedDistance: '0m',
    formattedSpeed: '0.0km/h',
    saving: false,
    saveError: null as string | null,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    addPoint: vi.fn(),
    dispose: vi.fn(),
    maxRouteMeters: 0,
    setRoutePoints: vi.fn(),
    displayName: null as string | null,
    latestLat: null as number | null,
    latestLng: null as number | null,
  },
}));

vi.mock('../stores/TrackingStore', () => ({
  TrackingStore: vi.fn(function () { return mockTrackingStore; }),
}));

const { mockLeaderboardStore } = vi.hoisted(() => ({
  mockLeaderboardStore: {
    rankings: [] as { userId: string; displayName: string; maxRouteMeters: number; isLive: boolean }[],
    loading: false,
    error: null as string | null,
    load: vi.fn(),
    dispose: vi.fn(),
  },
}));

vi.mock('../stores/LeaderboardStore', () => ({
  LeaderboardStore: vi.fn(function () { return mockLeaderboardStore; }),
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
    mockTrackingStore.isTracking = false;
    mockTrackingStore.isPaused = false;
    mockTrackingStore.saving = false;
    mockTrackingStore.saveError = null;
    mockTrackingStore.formattedTime = '00:00:00';
    mockTrackingStore.formattedDistance = '0m';
    mockTrackingStore.formattedSpeed = '0.0km/h';
    mockTrackingStore.maxRouteMeters = 0;
    mockGroupMapStore.isPeriodActive = false;
    mockGroupMapStore.periodStartedAt = null;
    mockLeaderboardStore.rankings = [];
    mockLeaderboardStore.loading = false;
    mockLeaderboardStore.load.mockResolvedValue(undefined);
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

  it('뒤로가기 버튼 표시', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /뒤로/ })).toBeInTheDocument();
    });
  });

  it('뒤로가기 버튼 클릭 시 navigate(-1) 호출', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => screen.getByRole('button', { name: /뒤로/ }));
    fireEvent.click(screen.getByRole('button', { name: /뒤로/ }));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
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
        expect(screen.getByRole('button', { name: /설정/i })).toBeInTheDocument();
      });
    });

    it('멤버에게 설정 링크 숨김 (created_by 불일치)', async () => {
      mockGroupMapStore.currentUserId = 'other-user';
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /설정/i })).not.toBeInTheDocument();
    });
  });

  describe('트래킹 UI', () => {
    it('트래킹 전 — 시작 버튼 표시', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /● 시작/ })).toBeInTheDocument();
      });
    });

    it('시작 버튼 클릭 시 trackingStore.start() 호출', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /● 시작/ }));
      fireEvent.click(screen.getByRole('button', { name: /● 시작/ }));
      expect(mockTrackingStore.start).toHaveBeenCalledOnce();
    });

    it('트래킹 중 — 통계 패널 표시', async () => {
      mockTrackingStore.isTracking = true;
      mockTrackingStore.formattedTime = '00:01:23';
      mockTrackingStore.formattedDistance = '250m';
      mockTrackingStore.formattedSpeed = '3.5km/h';
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByText('00:01:23')).toBeInTheDocument();
        expect(screen.getByText('250m')).toBeInTheDocument();
        expect(screen.getByText('3.5km/h')).toBeInTheDocument();
      });
    });

    it('트래킹 중 — 일시정지 버튼 표시', async () => {
      mockTrackingStore.isTracking = true;
      mockTrackingStore.isPaused = false;
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /일시정지/ })).toBeInTheDocument();
      });
    });

    it('일시정지 후 종료 버튼 클릭 시 trackingStore.stop() 호출', async () => {
      mockTrackingStore.isTracking = true;
      mockTrackingStore.isPaused = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /종료/ }));
      fireEvent.click(screen.getByRole('button', { name: /종료/ }));
      expect(mockTrackingStore.stop).toHaveBeenCalledOnce();
    });

    it('트래킹 중 — 시작 버튼 미표시', async () => {
      mockTrackingStore.isTracking = true;
      mockTrackingStore.isPaused = false;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /일시정지/ }));
      expect(screen.queryByRole('button', { name: /시작/ })).not.toBeInTheDocument();
    });

    it('saving 중 통계 패널 유지', async () => {
      mockTrackingStore.isTracking = false;
      mockTrackingStore.saving = true;
      mockTrackingStore.formattedTime = '00:00:05';
      mockTrackingStore.formattedDistance = '0m';
      mockTrackingStore.formattedSpeed = '0.0km/h';
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByText('00:00:05')).toBeInTheDocument();
      });
    });

    it('saving 중 중지 버튼 disabled', async () => {
      mockTrackingStore.isTracking = false;
      mockTrackingStore.saving = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /저장 중/ })).toBeDisabled();
      });
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

  describe('칩 탭', () => {
    it('초기에 지도 탭이 활성 — map-container 표시', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /지도/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /순위/ })).toBeInTheDocument();
    });

    it('순위 탭 클릭 시 순위 패널 표시', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /순위/ }));
      expect(screen.getByTestId('leaderboard-panel')).toBeInTheDocument();
    });

    it('지도 탭 클릭 시 지도 컨테이너 표시', async () => {
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /지도/ }));
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });

  describe('관리자 기간 버튼', () => {
    it('관리자 + 기간 비활성 — "활동 시작" 버튼 표시', async () => {
      mockGroupMapStore.isPeriodActive = false;
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /활동 시작/ })).toBeInTheDocument();
      });
    });

    it('관리자 + 기간 활성 — "활동 시작" 버튼 미표시', async () => {
      mockGroupMapStore.isPeriodActive = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByTestId('map-container'));
      expect(screen.queryByRole('button', { name: /활동 시작/ })).not.toBeInTheDocument();
    });

    it('"활동 시작" 클릭 시 startPeriod() 호출', async () => {
      mockGroupMapStore.isPeriodActive = false;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /활동 시작/ }));
      fireEvent.click(screen.getByRole('button', { name: /활동 시작/ }));
      expect(mockGroupMapStore.startPeriod).toHaveBeenCalledOnce();
    });

    it('멤버에게 "활동 시작" 버튼 미표시', async () => {
      mockGroupMapStore.currentUserId = 'other-user';
      mockGroupMapStore.isPeriodActive = false;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByTestId('map-container'));
      expect(screen.queryByRole('button', { name: /활동 시작/ })).not.toBeInTheDocument();
    });

    it('"활동 종료" 클릭 시 endPeriod() 호출', async () => {
      mockGroupMapStore.isPeriodActive = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /순위/ }));
      await waitFor(() => screen.getByRole('button', { name: /활동 종료/ }));
      fireEvent.click(screen.getByRole('button', { name: /활동 종료/ }));
      expect(mockGroupMapStore.endPeriod).toHaveBeenCalledOnce();
    });

    it('순위 탭 + 기간 활성 + 관리자 — "활동 종료" 버튼 표시', async () => {
      mockGroupMapStore.isPeriodActive = true;
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /순위/ }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /활동 종료/ })).toBeInTheDocument();
      });
    });
  });
});
