import { useRef, useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { NavigationBar } from '../components/NavigationBar';
import { runInAction, autorun, reaction } from 'mobx';
import { Button } from '@/components/ui/button';
import { Crosshair, Trophy, X, Settings } from 'lucide-react';
import { MapStore } from '../stores/MapStore';
import { GroupMapStore } from '../stores/GroupMapStore';
import { TrackingStore } from '../stores/TrackingStore';
import { LeaderboardStore } from '../stores/LeaderboardStore';
import { parseGpxPoints, totalRouteDistance } from '../utils/routeProjection';
import type { Ranking } from '../stores/LeaderboardStore';

export const GroupMapPage = observer(() => {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapStore] = useState(() => new MapStore());
  const [store] = useState(() => new GroupMapStore(navigate));
  const [trackingStore] = useState(() => new TrackingStore(id!, []));
  const [leaderboardStore] = useState(() => new LeaderboardStore(id!));
  const [activeTab, setActiveTab] = useState<'map' | 'leaderboard'>('map');

  const routePoints = useMemo(
    () => (store.gpxText ? parseGpxPoints(store.gpxText) : []),
    [store.gpxText]
  );

  const totalRouteMeters = useMemo(
    () => totalRouteDistance(routePoints),
    [routePoints]
  );

  useEffect(() => {
    if (!id) return;
    return store.load(id);
  }, [store, id]);

  useEffect(() => {
    if (!mapRef.current || store.gpxText === undefined || store.group === undefined || store.group === null) {
      return () => { mapStore.destroy(); };
    }
    mapStore.initMap(mapRef.current);
    mapStore.startWatchingLocation((lat, lng) => trackingStore.addPoint(lat, lng));
    if (store.gpxText !== null) {
      mapStore.drawGpxRoute(store.gpxText);
    } else {
      runInAction(() => { mapStore.error = true; });
    }
    return () => { mapStore.destroy(); };
  }, [mapStore, trackingStore, store.gpxText, store.group]);

  useEffect(() => {
    if (routePoints.length > 0) trackingStore.setRoutePoints(routePoints);
  }, [trackingStore, routePoints]);

  // 그룹/GPX 로드 완료 후 한 번만 실행: restore, leaderboard, period 구독
  const initialized = useRef(false);
  useEffect(() => {
    if (!id || store.group == null || store.gpxText == null || initialized.current) return;
    initialized.current = true;

    void trackingStore.restore();
    void leaderboardStore.load(store.periodStartedAt ?? null);

    const admin = store.currentUserId === store.group?.created_by;
    const unsubscribe = store.subscribeToPeriodEvents(admin);
    const disposerEnd = reaction(
      () => store.periodEndedAt,
      (endedAt) => {
        void leaderboardStore.load(store.periodStartedAt);
        if (endedAt && trackingStore.isTracking) {
          void trackingStore.stop();
        }
      },
    );
    const disposerStart = reaction(
      () => store.periodStartedAt,
      (startedAt) => { void leaderboardStore.load(startedAt); },
    );

    return () => { unsubscribe(); disposerEnd(); disposerStart(); };
  }, [id, store, store.group, store.gpxText, trackingStore, leaderboardStore]);

  useEffect(() => {
    return () => { trackingStore.dispose(); leaderboardStore.dispose(); };
  }, [trackingStore, leaderboardStore]);

  useEffect(() => {
    const disposer = autorun(() => {
      leaderboardStore.rankings.forEach((r) => {
        if (r.userId === store.currentUserId) return;
        if (r.lat != null && r.lng != null) {
          mapStore.updateMemberMarker(r.userId, r.displayName, r.lat, r.lng);
        }
      });
    });
    return disposer;
  }, [leaderboardStore, mapStore, store]);

  if (store.group === null) return <Navigate to="/group" replace />;

  if (store.group === undefined || store.gpxText === undefined) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white">
        <div
          role="status"
          className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin"
        />
      </div>
    );
  }

  const isAdmin = store.currentUserId === store.group.created_by;
  const bottomOffset = (trackingStore.isTracking || trackingStore.saving) ? 'bottom-44' : 'bottom-24';

  const displayRankings = (() => {
    if (!trackingStore.isTracking || !store.currentUserId) return leaderboardStore.rankings;
    const meAlreadyIn = leaderboardStore.rankings.some((r) => r.userId === store.currentUserId);
    if (meAlreadyIn) return leaderboardStore.rankings;
    const myEntry: Ranking = {
      userId: store.currentUserId,
      displayName: trackingStore.displayName ?? '나',
      maxRouteMeters: trackingStore.maxRouteMeters,
      isLive: true,
      lat: trackingStore.latestLat,
      lng: trackingStore.latestLng,
    };
    return [...leaderboardStore.rankings, myEntry].sort((a, b) => b.maxRouteMeters - a.maxRouteMeters);
  })();

  const formatProgress = (maxRouteMeters: number) => {
    if (totalRouteMeters > 0) {
      const pct = Math.min(100, Math.round((maxRouteMeters / totalRouteMeters) * 100));
      return `${pct}%`;
    }
    return maxRouteMeters >= 1000
      ? `${(maxRouteMeters / 1000).toFixed(1)}km`
      : `${Math.round(maxRouteMeters)}m`;
  };

  return (
    <div className="absolute inset-0">
      {/* Map container */}
      <div
        ref={mapRef}
        data-testid="map-container"
        className="absolute inset-0 w-full h-full"
      />

      {/* Error overlay */}
      {mapStore.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <p className="text-[13px] text-black/35">지도를 불러올 수 없습니다</p>
        </div>
      )}

      {/* Return to course */}
      {mapStore.map && !mapStore.isCourseVisible && (
        <div className="absolute top-[56px] right-4 z-20">
          <button
            onClick={() => mapStore.returnToCourse()}
            className="bg-white text-black px-4 py-2 rounded-full text-[12px] font-bold shadow-lg shadow-black/10 whitespace-nowrap border border-black/[0.06]"
          >
            코스로 돌아가기
          </button>
        </div>
      )}

      {/* Side action buttons */}
      {mapStore.map && (
        <div className={`absolute right-4 ${bottomOffset} z-10 flex flex-col gap-2`}>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setActiveTab(activeTab === 'leaderboard' ? 'map' : 'leaderboard')}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTab(activeTab === 'leaderboard' ? 'map' : 'leaderboard'); }}
            aria-label="순위"
            className={`rounded-xl shadow-lg shadow-black/10 border border-black/[0.06] ${activeTab === 'leaderboard' ? 'bg-black text-white hover:bg-black/90' : 'bg-white hover:bg-white'}`}
          >
            <Trophy size={18} className={activeTab === 'leaderboard' ? 'text-white' : 'text-black/60'} />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => mapStore.locate()}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); mapStore.locate(); }}
            aria-label="내 위치"
            className="bg-white hover:bg-white rounded-xl shadow-lg shadow-black/10 border border-black/[0.06]"
          >
            <Crosshair size={18} className="text-black/60" />
          </Button>
        </div>
      )}

      {/* Admin period controls — same position as tracking start button */}
      {isAdmin && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          {!store.isPeriodActive ? (
            <button
              onClick={() => void store.startPeriod()}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); void store.startPeriod(); }}
              className="bg-black text-white px-10 py-3.5 rounded-full text-[15px] font-bold shadow-lg shadow-black/25 active:scale-95 transition-transform"
            >
              활동 시작
            </button>
          ) : (
            <button
              onClick={() => void store.endPeriod()}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); void store.endPeriod(); }}
              className="bg-white text-black/60 px-10 py-3.5 rounded-full text-[15px] font-bold shadow-lg shadow-black/10 border border-black/[0.06] active:scale-95 transition-transform"
            >
              활동 종료
            </button>
          )}
        </div>
      )}

      {/* Tracking start button */}
      {!isAdmin && !trackingStore.isTracking && !trackingStore.saving && !trackingStore.restoring && activeTab === 'map' && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
          <button
            disabled={!store.isPeriodActive}
            onClick={() => void trackingStore.start()}
            onTouchEnd={(e) => { if (!store.isPeriodActive) return; e.preventDefault(); e.stopPropagation(); void trackingStore.start(); }}
            className={`px-10 py-3.5 rounded-full text-[15px] font-bold shadow-lg transition-transform ${
              store.isPeriodActive
                ? 'bg-black text-white shadow-black/25 active:scale-95'
                : 'bg-neutral-300 text-white shadow-black/10 cursor-not-allowed'
            }`}
          >
            시작
          </button>
          {!store.isPeriodActive && (
            <p className="text-[12px] font-medium text-black/70 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm whitespace-nowrap">관리자가 활동을 시작하면 시작할 수 있습니다</p>
          )}
        </div>
      )}

      {/* Tracking panel */}
      {(trackingStore.isTracking || trackingStore.saving) && (
        <div className="absolute bottom-6 left-4 right-4 z-10 bg-white rounded-2xl shadow-xl shadow-black/10 border border-black/[0.06] px-5 py-4">
          <div className="flex justify-around text-center mb-3">
            <div>
              <p className="text-[20px] font-bold tabular-nums text-black">{trackingStore.formattedTime}</p>
              <p className="text-[11px] text-black/35 font-medium">경과 시간</p>
            </div>
            <div className="w-px bg-black/[0.06]" />
            <div>
              <p className="text-[20px] font-bold tabular-nums text-black">
                {totalRouteMeters > 0
                  ? `${Math.max(0, (totalRouteMeters - trackingStore.maxRouteMeters) / 1000).toFixed(1)}km`
                  : '—'}
              </p>
              <p className="text-[11px] text-black/35 font-medium">남은 거리</p>
            </div>
          </div>
          {trackingStore.saving && (
            <button disabled className="w-full py-3 rounded-xl text-[14px] font-semibold bg-black/[0.06] text-black/30 cursor-not-allowed">
              저장 중...
            </button>
          )}
          {!trackingStore.saving && !trackingStore.isPaused && (
            <button
              onClick={() => void trackingStore.pause()}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); void trackingStore.pause(); }}
              className="w-full py-3 rounded-xl text-[14px] font-semibold bg-black/[0.08] text-black/60"
            >
              일시정지
            </button>
          )}
          {!trackingStore.saving && trackingStore.isPaused && (
            <div className="flex gap-2">
              <button
                onClick={() => void trackingStore.resume()}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); void trackingStore.resume(); }}
                className="flex-1 py-3 rounded-xl text-[14px] font-semibold bg-black text-white"
              >
                재개
              </button>
              <button
                onClick={() => void trackingStore.stop()}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); void trackingStore.stop(); }}
                className="flex-1 py-3 rounded-xl text-[14px] font-semibold bg-red-500 text-white"
              >
                종료
              </button>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard panel */}
      {activeTab === 'leaderboard' && (
        <div data-testid="leaderboard-panel" className="absolute bottom-6 left-4 right-4 top-20 z-10 bg-white rounded-2xl shadow-xl shadow-black/10 border border-black/[0.06] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center px-4 h-12 border-b border-black/[0.06] shrink-0">
            <span className="flex-1 text-[15px] font-bold text-black">순위</span>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full mr-2 ${
              store.isPeriodActive
                ? 'bg-black text-white'
                : 'bg-black/[0.05] text-black/35'
            }`}>
              {store.isPeriodActive ? '활동 중' : '비활성'}
            </span>
            <button
              onClick={() => setActiveTab('map')}
              aria-label="닫기"
              className="w-8 h-8 flex items-center justify-center text-black/30 hover:text-black -mr-1 min-h-0 min-w-0"
            >
              <X size={18} />
            </button>
          </div>
          {/* Period info */}
          {!store.isPeriodActive && (
            <div className="px-4 py-2.5 border-b border-black/[0.04] bg-black/[0.02]">
              <p className="text-[11px] text-black/35">
                {store.periodStartedAt
                  ? `활동 기간: ${store.periodStartedAt.toLocaleDateString()} ~ ${store.periodEndedAt?.toLocaleDateString() ?? ''}`
                  : '활동 기간이 없습니다'}
              </p>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {leaderboardStore.loading && (
              <div className="flex justify-center py-8">
                <div role="status" className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
              </div>
            )}
            {!leaderboardStore.loading && displayRankings.map((r: Ranking, i: number) => (
              <div
                key={r.userId}
                className={`flex items-center px-4 py-3.5 border-b border-black/[0.04] ${
                  r.userId === store.currentUserId ? 'bg-black/[0.02]' : ''
                }`}
              >
                <span className={`w-7 text-[14px] font-bold ${i === 0 ? 'text-black' : 'text-black/20'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-[14px] font-medium text-black/80">{r.displayName}</span>
                {r.isLive && (
                  <span className="text-[11px] text-trail-green font-semibold mr-2">LIVE</span>
                )}
                <span className="text-[13px] text-black/40 tabular-nums font-semibold">
                  {formatProgress(r.maxRouteMeters)}
                </span>
              </div>
            ))}
            {!leaderboardStore.loading && displayRankings.length === 0 && (
              <p className="text-center text-[13px] text-black/30 py-8">아직 기록이 없습니다</p>
            )}
          </div>
        </div>
      )}

      <NavigationBar
        title={store.group.name}
        onBack={() => navigate(-1)}
        overlay
        rightAction={
          store.currentUserId && store.group && store.currentUserId === store.group.created_by ? (
            <button
              onClick={() => navigate(`/group/${id}/settings`)}
              aria-label="설정"
              className="min-h-0 min-w-0 text-black/50 active:text-black/30"
            >
              <Settings size={20} />
            </button>
          ) : undefined
        }
      />
    </div>
  );
});
