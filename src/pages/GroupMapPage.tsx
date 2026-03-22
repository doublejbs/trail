import { useRef, useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { NavigationBar } from '../components/NavigationBar';
import { runInAction, autorun, reaction } from 'mobx';
import { Button } from '@/components/ui/button';
import { Crosshair } from 'lucide-react';
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

  // Effect 1: 데이터 fetch
  useEffect(() => {
    if (!id) return;
    return store.load(id);
  }, [store, id]);

  // Effect 2: 지도 초기화 + GPX 렌더링
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

  // Effect 3: TrackingStore routePoints 주입
  useEffect(() => {
    if (routePoints.length > 0) trackingStore.setRoutePoints(routePoints);
  }, [trackingStore, routePoints]);

  // Effect 4: LeaderboardStore 로드
  useEffect(() => {
    if (store.group != null && store.gpxText != null) {
      void leaderboardStore.load(store.periodStartedAt ?? null);
    }
  }, [leaderboardStore, store.group, store.gpxText, store.periodStartedAt]);

  // Effect 5: TrackingStore 정리
  useEffect(() => {
    return () => { trackingStore.dispose(); };
  }, [trackingStore]);

  // Effect 6: LeaderboardStore 정리
  useEffect(() => {
    return () => { leaderboardStore.dispose(); };
  }, [leaderboardStore]);

  // Effect 7: 다른 멤버 위치 마커 갱신
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

  // Effect 8: period broadcast 구독 + 리더보드 재로드
  useEffect(() => {
    if (!id || store.group == null) return;
    const unsubscribe = store.subscribeToPeriodEvents();
    const disposerEnd = reaction(
      () => store.periodEndedAt,
      () => { void leaderboardStore.load(store.periodStartedAt); },
    );
    const disposerStart = reaction(
      () => store.periodStartedAt,
      (startedAt) => { void leaderboardStore.load(startedAt); },
    );
    return () => { unsubscribe(); disposerEnd(); disposerStart(); };
  }, [id, store, leaderboardStore]);

  if (store.group === null) return <Navigate to="/group" replace />;

  if (store.group === undefined || store.gpxText === undefined) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div
          role="status"
          className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"
        />
      </div>
    );
  }

  const isAdmin = store.currentUserId === store.group.created_by;
  const bottomOffset = (trackingStore.isTracking || trackingStore.saving) ? 'bottom-36' : 'bottom-20';

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
      {/* 네이버 지도 컨테이너 */}
      <div
        ref={mapRef}
        data-testid="map-container"
        className="absolute inset-0 w-full h-full"
      />

      {/* 에러 오버레이 */}
      {mapStore.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
          <p className="text-sm text-neutral-500">지도를 불러올 수 없습니다</p>
        </div>
      )}

      {/* 코스로 돌아가기 버튼 */}
      {mapStore.map && !mapStore.isCourseVisible && (
        <div className={`absolute ${bottomOffset} left-1/2 -translate-x-1/2 z-10`}>
          <button
            onClick={() => mapStore.returnToCourse()}
            className="bg-white/90 text-black px-4 py-2 rounded-full text-sm font-medium shadow-md whitespace-nowrap"
          >
            코스로 돌아가기
          </button>
        </div>
      )}

      {/* 내 위치 버튼 */}
      {mapStore.map && (
        <div className={`absolute right-3 ${bottomOffset} z-10`}>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => mapStore.locate()}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); mapStore.locate(); }}
            aria-label="내 위치"
            className="bg-white hover:bg-neutral-50 shadow-md"
          >
            <Crosshair size={18} className="text-neutral-700" />
          </Button>
        </div>
      )}

      {/* 트래킹 시작 버튼 + 관리자 활동 시작 버튼 (지도 탭, 미추적 중) */}
      {!trackingStore.isTracking && !trackingStore.saving && activeTab === 'map' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
          {isAdmin && !store.isPeriodActive && (
            <button
              onClick={() => void store.startPeriod()}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); void store.startPeriod(); }}
              className="bg-green-500 text-white px-6 py-2 rounded-full text-sm font-semibold shadow-lg"
            >
              ▶ 활동 시작
            </button>
          )}
          <button
            onClick={() => trackingStore.start()}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); trackingStore.start(); }}
            className="bg-black text-white px-8 py-3 rounded-full text-sm font-semibold shadow-lg"
          >
            ● 시작
          </button>
        </div>
      )}

      {/* 트래킹 중 통계 패널 */}
      {(trackingStore.isTracking || trackingStore.saving) && (
        <div className="absolute bottom-6 left-4 right-4 z-10 bg-white/90 rounded-2xl shadow-lg px-4 py-3">
          <div className="flex justify-around text-center mb-2">
            <div>
              <p className="text-base font-semibold tabular-nums">{trackingStore.formattedTime}</p>
              <p className="text-xs text-neutral-500">시간</p>
            </div>
            <div>
              <p className="text-base font-semibold tabular-nums">{trackingStore.formattedDistance}</p>
              <p className="text-xs text-neutral-500">거리</p>
            </div>
            <div>
              <p className="text-base font-semibold tabular-nums">{trackingStore.formattedSpeed}</p>
              <p className="text-xs text-neutral-500">속도</p>
            </div>
          </div>
          {trackingStore.saving && (
            <button disabled className="w-full py-2 rounded-xl text-sm font-semibold bg-neutral-300 text-neutral-500 cursor-not-allowed">
              저장 중...
            </button>
          )}
          {!trackingStore.saving && !trackingStore.isPaused && (
            <button
              onClick={() => trackingStore.pause()}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); trackingStore.pause(); }}
              className="w-full py-2 rounded-xl text-sm font-semibold bg-neutral-400 text-white"
            >
              ⏸ 일시정지
            </button>
          )}
          {!trackingStore.saving && trackingStore.isPaused && (
            <div className="flex gap-2">
              <button
                onClick={() => trackingStore.resume()}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); trackingStore.resume(); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-black text-white"
              >
                ▶ 재개
              </button>
              <button
                onClick={() => trackingStore.stop()}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); trackingStore.stop(); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white"
              >
                ■ 종료
              </button>
            </div>
          )}
        </div>
      )}

      {/* 순위 패널 (순위 탭) */}
      {activeTab === 'leaderboard' && (
        <div data-testid="leaderboard-panel" className="absolute bottom-6 left-4 right-4 top-20 z-10 bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
          <div className={`px-4 py-2 text-xs font-semibold ${store.isPeriodActive ? 'bg-green-500 text-white' : 'bg-neutral-200 text-neutral-500'}`}>
            {store.isPeriodActive
              ? '● 활동 중 · 1초마다 갱신'
              : store.periodStartedAt
                ? `활동 기간: ${store.periodStartedAt.toLocaleDateString()} ~ ${store.periodEndedAt?.toLocaleDateString() ?? ''}`
                : '활동 기간이 없습니다'}
          </div>
          <div className="flex-1 overflow-y-auto">
            {leaderboardStore.loading && (
              <div className="flex justify-center py-8">
                <div role="status" className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
              </div>
            )}
            {!leaderboardStore.loading && displayRankings.map((r: Ranking, i: number) => (
              <div
                key={r.userId}
                className={`flex items-center px-4 py-3 border-b border-neutral-100 ${r.userId === store.currentUserId ? 'bg-blue-50' : ''}`}
              >
                <span className="w-7 font-bold text-base">{i + 1}</span>
                <span className="flex-1 text-sm font-medium">{r.displayName}</span>
                <span className="text-xs text-neutral-500 mr-2">
                  {formatProgress(r.maxRouteMeters)}
                </span>
                {r.isLive && <span className="text-xs text-red-500">● 라이브</span>}
              </div>
            ))}
            {!leaderboardStore.loading && displayRankings.length === 0 && (
              <p className="text-center text-sm text-neutral-400 py-8">아직 기록이 없습니다</p>
            )}
          </div>
          {isAdmin && store.isPeriodActive && (
            <div className="p-3">
              <button
                onClick={() => void store.endPeriod()}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); void store.endPeriod(); }}
                className="w-full bg-red-500 text-white py-2 rounded-xl text-sm font-semibold"
              >
                ■ 활동 종료
              </button>
            </div>
          )}
        </div>
      )}

      <NavigationBar
        title="그룹 지도"
        onBack={() => navigate(-1)}
        overlay
        rightAction={
          store.currentUserId && store.group && store.currentUserId === store.group.created_by ? (
            <button
              onClick={() => navigate(`/group/${id}/settings`)}
              aria-label="설정"
              className="text-hig-headline min-h-0 min-w-0"
            >
              ⚙
            </button>
          ) : undefined
        }
      />
      {/* 칩 탭 */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        <button
          onClick={() => setActiveTab('map')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold ${activeTab === 'map' ? 'bg-white text-black' : 'bg-white/40 text-white'}`}
        >
          🗺 지도
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold ${activeTab === 'leaderboard' ? 'bg-white text-black' : 'bg-white/40 text-white'}`}
        >
          🏆 순위
        </button>
      </div>
    </div>
  );
});
