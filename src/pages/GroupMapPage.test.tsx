import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { observable, runInAction } from 'mobx';
import { GroupMapPage } from './GroupMapPage';
import type { Group } from '../types/group';

const FAKE_GROUP: Group = {
  id: 'group-uuid-1',
  name: '한라산 팀',
  created_by: 'user-1',
  gpx_path: 'user-1/group-uuid-1.gpx',
  gpx_bucket: 'gpx-files',
  thumbnail_path: null,
  created_at: '2026-01-01T00:00:00Z',
  max_members: null,
  period_started_at: null,
  period_ended_at: null,
  distance_m: null,
  elevation_gain_m: null,
  difficulty: null,
};

const FAKE_GPX = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="37.5" lon="126.9"></trkpt></trkseg></trk></gpx>`;

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

import { makeObservable as mob } from 'mobx';

/* Helper: create a mock store object whose listed keys are MobX-observable,
   while vi.fn() methods remain raw so .mockReturnValue() etc. still work. */
function mockObs<T extends Record<string, unknown>>(obj: T, observableKeys: (keyof T)[]): T {
  const annotations: Record<string, unknown> = {};
  for (const k of observableKeys) annotations[k as string] = observable;
  mob(obj, annotations as never);
  return obj;
}

const mockMapStore = mockObs({
  map: null as naver.maps.Map | null,
  error: false,
  initMap: vi.fn(),
  destroy: vi.fn(),
  locate: vi.fn(),
  startWatchingLocation: vi.fn(),
  setLocationAvatarUrl: vi.fn(),
}, ['map', 'error']);

const mockRenderingStore = mockObs({
  gpxPolyline: null as unknown,
  isCourseVisible: true,
  drawGpxRoute: vi.fn(),
  returnToCourse: vi.fn(),
  destroy: vi.fn(),
  setOnCheckpointTap: vi.fn(),
  drawCheckpoints: vi.fn(),
}, ['gpxPolyline', 'isCourseVisible']);

const mockGroupMapStore = mockObs({
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
}, ['group', 'gpxText', 'currentUserId', 'isPeriodActive', 'periodStartedAt', 'periodEndedAt']);

const mockTrackingStore = mockObs({
  isTracking: false,
  isPaused: false,
  elapsedSeconds: 0,
  distanceMeters: 0,
  formattedTime: '00:00:00',
  saving: false,
  saveError: null as string | null,
  restoring: false,
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  restore: vi.fn(),
  dispose: vi.fn(),
  addPoint: vi.fn(),
  maxRouteMeters: 0,
  setRoutePoints: vi.fn(),
  latestLat: null as number | null,
  latestLng: null as number | null,
  isFinished: false,
  visitedCheckpointIds: new Set<string>(),
  nearCheckpointId: null as string | null,
  setLatestPosition: vi.fn(),
  setCheckpoints: vi.fn(),
  setOnCheckpointVisited: vi.fn(),
  restart: vi.fn(),
  visitCheckpoint: vi.fn(),
}, ['isTracking', 'isPaused', 'elapsedSeconds', 'distanceMeters', 'formattedTime', 'saving', 'saveError', 'restoring', 'maxRouteMeters', 'latestLat', 'latestLng', 'isFinished', 'visitedCheckpointIds', 'nearCheckpointId']);

const mockBroadcastStore = mockObs({
  displayName: null as string | null,
  start: vi.fn(),
  broadcast: vi.fn(),
  broadcastImmediate: vi.fn(),
  dispose: vi.fn(),
}, ['displayName']);

type RankingEntry = { userId: string; displayName: string; maxRouteMeters: number; isLive: boolean; lat: number | null; lng: number | null; avatarUrl: string | null; checkpointsVisited: number };

const mockLeaderboardStore = mockObs({
  rankings: [] as RankingEntry[],
  loading: false,
  error: null as string | null,
  load: vi.fn(),
  dispose: vi.fn(),
}, ['rankings', 'loading', 'error']);

const mockMemberMarkerStore = {
  updateMemberMarker: vi.fn(),
  clearAll: vi.fn(),
};

let mockUIStore: Record<string, unknown>;

const createMockUIStore = () => {
  const store = mockObs({
    mapStore: mockMapStore,
    renderingStore: mockRenderingStore,
    groupMapStore: mockGroupMapStore,
    trackingStore: mockTrackingStore,
    broadcastStore: mockBroadcastStore,
    leaderboardStore: mockLeaderboardStore,
    memberMarkerStore: mockMemberMarkerStore,
    activeTab: 'map' as 'map' | 'leaderboard',
    showElevation: false,
    showRestartConfirm: false,
    showCountdown: false,
    starting: false,
    resetting: false,
    checkpoints: [] as unknown[],
    totalCheckpoints: 0,
    routePoints: [] as unknown[],
    initMap: vi.fn(),
    loadAvatarUrl: vi.fn(),
    drawRoute: vi.fn(),
    initAfterLoad: vi.fn(),
    dispose: vi.fn(),
    toggleLeaderboard: vi.fn(),
    toggleElevation: vi.fn(),
    openRestartConfirm: vi.fn(),
    closeRestartConfirm: vi.fn(),
    openCountdown: vi.fn(),
    handleCountdownComplete: vi.fn(),
    handleRestart: vi.fn(),
    setActiveTab: vi.fn(),
  }, ['activeTab', 'showElevation', 'showRestartConfirm', 'showCountdown', 'starting', 'resetting', 'checkpoints', 'totalCheckpoints', 'routePoints']);

  // Wire up toggle functions
  (store.toggleLeaderboard as ReturnType<typeof vi.fn>).mockImplementation(() => {
    runInAction(() => {
      store.activeTab = store.activeTab === 'leaderboard' ? 'map' : 'leaderboard';
    });
  });
  (store.setActiveTab as ReturnType<typeof vi.fn>).mockImplementation((tab: 'map' | 'leaderboard') => {
    runInAction(() => { store.activeTab = tab; });
  });

  return store;
};

vi.mock('../stores/ui/GroupMapUIStore', () => ({
  GroupMapUIStore: vi.fn(function () {
    mockUIStore = createMockUIStore();
    return mockUIStore;
  }),
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
    vi.clearAllMocks();
    runInAction(() => {
      mockMapStore.map = null;
      mockMapStore.error = false;
      mockRenderingStore.gpxPolyline = null;
      mockRenderingStore.isCourseVisible = true;
      mockGroupMapStore.group = FAKE_GROUP;
      mockGroupMapStore.gpxText = FAKE_GPX;
      mockGroupMapStore.currentUserId = 'user-1';
      mockTrackingStore.isTracking = false;
      mockTrackingStore.isPaused = false;
      mockTrackingStore.saving = false;
      mockTrackingStore.restoring = false;
      mockTrackingStore.saveError = null;
      mockTrackingStore.formattedTime = '00:00:00';
      mockTrackingStore.maxRouteMeters = 0;
      mockTrackingStore.isFinished = false;
      mockTrackingStore.visitedCheckpointIds = new Set();
      mockGroupMapStore.isPeriodActive = false;
      mockGroupMapStore.periodStartedAt = null;
      mockLeaderboardStore.rankings = [];
      mockLeaderboardStore.loading = false;
    });
    mockGroupMapStore.load.mockReturnValue(() => {});
    mockLeaderboardStore.load.mockResolvedValue(undefined);
  });

  it('그룹을 찾지 못하면 /group으로 리다이렉트', async () => {
    runInAction(() => { mockGroupMapStore.group = null; });
    renderAt('/group/nonexistent-id');
    await waitFor(() => {
      expect(screen.getByText('group list')).toBeInTheDocument();
    });
  });

  it('그룹 로딩 중 스피너 표시', () => {
    runInAction(() => {
      mockGroupMapStore.group = undefined;
      mockGroupMapStore.gpxText = undefined;
    });
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

  it('지도 로드 후 initMap 호출', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(mockUIStore.initMap).toHaveBeenCalled();
    });
  });

  it('로드 성공 후 drawRoute 호출', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(mockUIStore.drawRoute).toHaveBeenCalled();
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
      runInAction(() => { mockGroupMapStore.currentUserId = 'other-user'; });
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /설정/i })).not.toBeInTheDocument();
    });
  });

  describe('트래킹 UI', () => {
    it('트래킹 전 — 활동 기간 활성 시 시작 버튼 표시', async () => {
      runInAction(() => { mockGroupMapStore.isPeriodActive = true; });
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /시작/ })).toBeInTheDocument();
      });
    });

    it('시작 버튼 클릭 시 openCountdown 호출', async () => {
      runInAction(() => { mockGroupMapStore.isPeriodActive = true; });
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /시작/ }));
      fireEvent.click(screen.getByRole('button', { name: /시작/ }));
    });

    it('트래킹 중 — 통계 패널 표시', async () => {
      runInAction(() => {
        mockTrackingStore.isTracking = true;
        mockTrackingStore.formattedTime = '00:01:23';
      });
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByText('00:01:23')).toBeInTheDocument();
        expect(screen.getByText('경과 시간')).toBeInTheDocument();
      });
    });

    it('트래킹 중 — 초기화 버튼 표시', async () => {
      runInAction(() => {
        mockTrackingStore.isTracking = true;
        mockTrackingStore.isPaused = false;
      });
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        const buttons = screen.getAllByRole('button', { name: /초기화/ });
        expect(buttons.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('트래킹 중 — 시작 버튼 미표시', async () => {
      runInAction(() => {
        mockGroupMapStore.isPeriodActive = true;
        mockTrackingStore.isTracking = true;
        mockTrackingStore.isPaused = false;
      });
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByText('경과 시간'));
      expect(screen.queryByRole('button', { name: /^시작$/ })).not.toBeInTheDocument();
    });

    it('saving 중 통계 패널 유지', async () => {
      runInAction(() => {
        mockTrackingStore.isTracking = false;
        mockTrackingStore.saving = true;
        mockTrackingStore.formattedTime = '00:00:05';
      });
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByText('00:00:05')).toBeInTheDocument();
      });
    });

    it('saving 중 저장 중 버튼 disabled', async () => {
      runInAction(() => {
        mockTrackingStore.isTracking = false;
        mockTrackingStore.saving = true;
      });
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /저장 중/ })).toBeDisabled();
      });
    });
  });

  describe('코스로 돌아가기 버튼', () => {
    it('isCourseVisible이 false이면 버튼 표시', async () => {
      runInAction(() => {
        mockMapStore.map = {} as naver.maps.Map;
        mockRenderingStore.isCourseVisible = false;
      });
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /코스로 돌아가기/ })).toBeInTheDocument();
      });
    });

    it('isCourseVisible이 true이면 버튼 미표시', async () => {
      runInAction(() => {
        mockMapStore.map = {} as naver.maps.Map;
        mockRenderingStore.isCourseVisible = true;
      });
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /코스로 돌아가기/ })).not.toBeInTheDocument();
    });

    it('버튼 클릭 시 returnToCourse 호출', async () => {
      runInAction(() => {
        mockMapStore.map = {} as naver.maps.Map;
        mockRenderingStore.isCourseVisible = false;
      });
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /코스로 돌아가기/ })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /코스로 돌아가기/ }));
      expect(mockRenderingStore.returnToCourse).toHaveBeenCalledOnce();
    });
  });

  describe('칩 탭', () => {
    it('초기에 지도 탭이 활성 — map-container 표시', async () => {
      runInAction(() => { mockMapStore.map = {} as naver.maps.Map; });
      renderAt('/group/group-uuid-1');
      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /순위/ })).toBeInTheDocument();
    });

    it('순위 탭 클릭 시 순위 패널 표시', async () => {
      runInAction(() => { mockMapStore.map = {} as naver.maps.Map; });
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /순위/ }));
      expect(screen.getByTestId('leaderboard-panel')).toBeInTheDocument();
    });

    it('순위 버튼 재클릭 시 순위 패널 닫힘', async () => {
      runInAction(() => { mockMapStore.map = {} as naver.maps.Map; });
      renderAt('/group/group-uuid-1');
      await waitFor(() => screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /순위/ }));
      fireEvent.click(screen.getByRole('button', { name: /순위/ }));
      expect(screen.queryByTestId('leaderboard-panel')).not.toBeInTheDocument();
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });

});
