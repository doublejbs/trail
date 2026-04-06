import { useRef, useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { NavigationBar } from '../components/NavigationBar';
import { RestartConfirmSheet } from '../components/RestartConfirmSheet';
import { CountdownOverlay } from '../components/CountdownOverlay';
import { FinishCelebration } from '../components/FinishCelebration';
import { runInAction, autorun } from 'mobx';
import { Button } from '@/components/ui/button';
import { Crosshair, Trophy, X, Settings, TrendingUp } from 'lucide-react';
import { ElevationChart } from '../components/ElevationChart';
import { totalRouteDistance } from '../utils/routeProjection';
import { GroupMapUIStore } from '../stores/ui/GroupMapUIStore';
import type { Ranking } from '../stores/LeaderboardStore';

export const GroupMapPage = observer(() => {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [uiStore] = useState(() => new GroupMapUIStore(id!, navigate));

  const { mapStore, renderingStore, groupMapStore, trackingStore, leaderboardStore } = uiStore;

  const totalRouteMeters = useMemo(
    () => totalRouteDistance(uiStore.routePoints),
    [uiStore.routePoints],
  );

  useEffect(() => {
    if (!id) return;
    return groupMapStore.load(id);
  }, [groupMapStore, id]);

  useEffect(() => {
    void uiStore.loadAvatarUrl();
  }, [uiStore]);

  useEffect(() => {
    if (!mapRef.current || !groupMapStore.group) return;
    uiStore.initMap(mapRef.current);
    return () => { uiStore.dispose(); };
  }, [uiStore, groupMapStore.group]);

  useEffect(() => {
    uiStore.drawRoute();
  }, [uiStore, groupMapStore.gpxText, mapStore.map]);

  useEffect(() => {
    if (uiStore.routePoints.length > 0) trackingStore.setRoutePoints(uiStore.routePoints);
  }, [trackingStore, uiStore.routePoints]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!id || groupMapStore.group == null || groupMapStore.gpxText == null || initialized.current) return;
    initialized.current = true;
    void uiStore.initAfterLoad(id);
  }, [id, uiStore, groupMapStore.group, groupMapStore.gpxText]);

  useEffect(() => {
    const disposer = autorun(() => {
      leaderboardStore.rankings.forEach((r) => {
        if (r.userId === groupMapStore.currentUserId) return;
        if (r.lat != null && r.lng != null) {
          uiStore.memberMarkerStore.updateMemberMarker(r.userId, r.displayName, r.lat, r.lng, r.avatarUrl);
        }
      });
    });
    return disposer;
  }, [leaderboardStore, uiStore.memberMarkerStore, groupMapStore]);

  useEffect(() => {
    if (uiStore.checkpoints.length === 0 || !mapStore.map) return;
    const disposer = autorun(() => {
      renderingStore.drawCheckpoints(
        uiStore.checkpoints,
        trackingStore.visitedCheckpointIds,
        trackingStore.nearCheckpointId,
      );
    });
    return disposer;
  }, [uiStore.checkpoints, mapStore, renderingStore, trackingStore]);

  if (groupMapStore.group === null) return <Navigate to="/group" replace />;

  if (groupMapStore.group === undefined) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white">
        <div
          role="status"
          className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin"
        />
      </div>
    );
  }


  const isTrackingActive = trackingStore.isTracking || trackingStore.saving;
  const sideButtonsBottom = uiStore.showElevation ? 236 : isTrackingActive ? 176 : 96;
  const trackingPanelBottom = uiStore.showElevation ? 228 : 24;
  const bottomCenterBottom = uiStore.showElevation ? 228 : 32;

  const displayRankings = (() => {
    if (!trackingStore.isTracking || !groupMapStore.currentUserId) return leaderboardStore.rankings;
    const meAlreadyIn = leaderboardStore.rankings.some((r) => r.userId === groupMapStore.currentUserId);
    if (meAlreadyIn) return leaderboardStore.rankings;
    const myEntry: Ranking = {
      userId: groupMapStore.currentUserId,
      displayName: uiStore.broadcastStore.displayName ?? '나',
      maxRouteMeters: trackingStore.maxRouteMeters,
      isLive: true,
      lat: trackingStore.latestLat,
      lng: trackingStore.latestLng,
      avatarUrl: null,
      checkpointsVisited: trackingStore.visitedCheckpointIds.size,
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
    <>
    <div className="absolute inset-0 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <NavigationBar
        title={groupMapStore.group.name}
        onBack={() => navigate(-1)}
        rightAction={
          groupMapStore.currentUserId && groupMapStore.group && groupMapStore.currentUserId === groupMapStore.group.created_by ? (
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

      <div className="flex-1 relative overflow-hidden">
      {/* Map container */}
      <div
        ref={mapRef}
        data-testid="map-container"
        className="absolute inset-0 w-full h-full"
      />

      {/* GPX 로딩 중 shimmer + pulse — 경로 그려질 때까지 유지 */}
      {!renderingStore.gpxPolyline && !mapStore.error && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(108deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)',
              animation: 'shimmer 2.2s ease-in-out infinite',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <div
                className="absolute w-20 h-20 rounded-full border border-black/20"
                style={{ animation: 'ping 1.8s cubic-bezier(0,0,0.2,1) infinite' }}
              />
              <div
                className="absolute w-10 h-10 rounded-full border border-black/25"
                style={{ animation: 'ping 1.8s cubic-bezier(0,0,0.2,1) 0.4s infinite' }}
              />
              <div className="w-2.5 h-2.5 rounded-full bg-black/40" />
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {mapStore.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <p className="text-[13px] text-black/35">지도를 불러올 수 없습니다</p>
        </div>
      )}

      {/* Return to course */}
      {mapStore.map && !renderingStore.isCourseVisible && (
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={() => renderingStore.returnToCourse()}
            className="bg-white text-black px-4 py-2 rounded-full text-[12px] font-bold shadow-lg shadow-black/10 whitespace-nowrap border border-black/[0.06]"
          >
            코스로 돌아가기
          </button>
        </div>
      )}

      {/* Side action buttons */}
      {mapStore.map && (
        <div
          className="absolute right-4 z-[102] flex flex-col gap-2 transition-all duration-300"
          style={{ bottom: sideButtonsBottom }}
        >
          <Button
            variant="secondary"
            size="icon"
            onClick={() => uiStore.toggleLeaderboard()}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); uiStore.toggleLeaderboard(); }}
            aria-label="순위"
            className={`rounded-xl shadow-lg shadow-black/10 border border-black/[0.06] ${uiStore.activeTab === 'leaderboard' ? 'bg-black text-white hover:bg-black/90' : 'bg-white hover:bg-white'}`}
          >
            <Trophy size={18} className={uiStore.activeTab === 'leaderboard' ? 'text-white' : 'text-black/60'} />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => uiStore.toggleElevation()}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); uiStore.toggleElevation(); }}
            aria-label="고도 프로파일"
            className={`rounded-xl shadow-lg shadow-black/10 border border-black/[0.06] ${uiStore.showElevation ? 'bg-black text-white hover:bg-black/90' : 'bg-white hover:bg-white'}`}
          >
            <TrendingUp size={18} className={uiStore.showElevation ? 'text-white' : 'text-black/60'} />
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

      {/* Bottom center buttons */}
      {uiStore.activeTab === 'map' && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 transition-all duration-300"
          style={{ bottom: bottomCenterBottom }}
        >
          {/* Tracking start button — visible to everyone when period is active and not tracking */}
          {groupMapStore.isPeriodActive && !trackingStore.isTracking && !trackingStore.saving && !trackingStore.restoring && !uiStore.showCountdown && (
            <button
              onClick={() => uiStore.openCountdown()}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); uiStore.openCountdown(); }}
              className="px-10 py-3.5 rounded-full text-[15px] font-bold shadow-lg transition-transform bg-black text-white shadow-black/25 active:scale-95"
            >
              시작
            </button>
          )}
        </div>
      )}

      {/* Tracking panel */}
      {isTrackingActive && (
        <div
          className="absolute left-4 right-4 z-[101] flex flex-col items-center gap-2 transition-all duration-300"
          style={{ bottom: trackingPanelBottom }}
        >
        <div className="w-full bg-white rounded-2xl shadow-xl shadow-black/10 border border-black/[0.06] px-5 py-4">
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
          {!trackingStore.saving && (
            <button
              onClick={() => !uiStore.resetting && uiStore.openRestartConfirm()}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); if (!uiStore.resetting) uiStore.openRestartConfirm(); }}
              disabled={uiStore.resetting}
              className="w-full py-3 rounded-xl text-[14px] font-semibold bg-black/[0.08] text-black/60 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {uiStore.resetting && <div className="w-4 h-4 border-2 border-black/15 border-t-black/50 rounded-full animate-spin" />}
              {uiStore.resetting ? '초기화 중...' : '초기화'}
            </button>
          )}
        </div>
        </div>
      )}

      {/* Leaderboard panel */}
      {uiStore.activeTab === 'leaderboard' && (
        <div data-testid="leaderboard-panel" className="absolute bottom-6 left-4 right-4 top-4 z-[103] bg-white rounded-2xl shadow-xl shadow-black/10 border border-black/[0.06] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center px-4 h-12 border-b border-black/[0.06] shrink-0">
            <span className="flex-1 text-[15px] font-bold text-black">순위</span>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full mr-2 ${
              groupMapStore.isPeriodActive
                ? 'bg-black text-white'
                : 'bg-black/[0.05] text-black/35'
            }`}>
              {groupMapStore.isPeriodActive ? '활동 중' : '비활성'}
            </span>
            <button
              onClick={() => uiStore.setActiveTab('map')}
              aria-label="닫기"
              className="w-8 h-8 flex items-center justify-center text-black/30 hover:text-black -mr-1 min-h-0 min-w-0"
            >
              <X size={18} />
            </button>
          </div>
          {/* Period info */}
          {!groupMapStore.isPeriodActive && (
            <div className="px-4 py-2.5 border-b border-black/[0.04] bg-black/[0.02]">
              <p className="text-[11px] text-black/35">
                {groupMapStore.periodStartedAt
                  ? `활동 기간: ${groupMapStore.periodStartedAt.toLocaleDateString()} ~ ${groupMapStore.periodEndedAt?.toLocaleDateString() ?? ''}`
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
                  r.userId === groupMapStore.currentUserId ? 'bg-black/[0.02]' : ''
                }`}
              >
                <span className={`w-7 text-[14px] font-bold ${i === 0 ? 'text-black' : 'text-black/20'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-[14px] font-medium text-black/80">{r.displayName}</span>
                {r.isLive && (
                  <span className="text-[11px] text-trail-green font-semibold mr-2">LIVE</span>
                )}
                <span className="text-[13px] text-black/40 tabular-nums font-semibold flex items-center gap-1.5">
                  {uiStore.totalCheckpoints > 0 && (
                    <span className="text-[11px] text-black/25">{r.checkpointsVisited ?? 0}/{uiStore.totalCheckpoints}</span>
                  )}
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

      {/* Elevation bottom sheet */}
      {uiStore.showElevation && groupMapStore.gpxText && (
        <div className="absolute bottom-0 left-0 right-0 z-[103] bg-white rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.10)]">
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-9 h-1 bg-black/10 rounded-full" />
          </div>
          <div className="flex items-center px-4 pb-1">
            <p className="flex-1 text-[14px] font-bold text-black">고도 프로파일</p>
            <button
              onClick={() => runInAction(() => { uiStore.showElevation = false; })}
              className="w-7 h-7 flex items-center justify-center text-black/30 active:text-black/60"
              aria-label="닫기"
            >
              <X size={16} />
            </button>
          </div>
          <ElevationChart
            gpxText={groupMapStore.gpxText}
            currentDistanceKm={trackingStore.isTracking ? trackingStore.maxRouteMeters / 1000 : undefined}
          />
        </div>
      )}

      </div>
    </div>

    <RestartConfirmSheet
      open={uiStore.showRestartConfirm}
      onConfirm={() => void uiStore.handleRestart()}
      onCancel={() => uiStore.closeRestartConfirm()}
    />

    {uiStore.showCountdown && !uiStore.starting && (
      <CountdownOverlay onComplete={() => void uiStore.handleCountdownComplete()} />
    )}

    {uiStore.starting && (
      <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
        <div className="w-7 h-7 border-3 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )}

    {trackingStore.isFinished && (
      <FinishCelebration
        elapsedTime={trackingStore.formattedTime}
        distanceKm={`${(trackingStore.maxRouteMeters / 1000).toFixed(1)}km`}
        onClose={() => runInAction(() => { trackingStore.isFinished = false; })}
      />
    )}
    </>
  );
});
