import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { Button } from '@/components/ui/button';
import { Crosshair } from 'lucide-react';
import { MapStore } from '../stores/MapStore';
import { GroupMapStore } from '../stores/GroupMapStore';
import { TrackingStore } from '../stores/TrackingStore';

export const GroupMapPage = observer(() => {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapStore] = useState(() => new MapStore());
  const [store] = useState(() => new GroupMapStore(navigate));
  const [trackingStore] = useState(() => new TrackingStore(id ?? ''));

  // Effect 1: 데이터 fetch
  useEffect(() => {
    if (!id) return;
    return store.load(id);
  }, [store, id]);

  // Effect 2: 지도 초기화 + GPX 렌더링 (DOM ref + 데이터가 준비된 후)
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

  // Effect 3: TrackingStore 정리
  useEffect(() => {
    return () => { trackingStore.dispose(); };
  }, [trackingStore]);

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

  const bottomOffset = (trackingStore.isTracking || trackingStore.saving) ? 'bottom-36' : 'bottom-20';

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

      {/* 트래킹 시작 버튼 */}
      {!trackingStore.isTracking && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
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
          <button
            onClick={() => trackingStore.stop()}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); trackingStore.stop(); }}
            disabled={trackingStore.saving}
            className={`w-full py-2 rounded-xl text-sm font-semibold ${
              trackingStore.saving
                ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                : 'bg-red-500 text-white'
            }`}
          >
            {trackingStore.saving ? '저장 중...' : '■ 중지'}
          </button>
        </div>
      )}

      {/* 뒤로가기 버튼 */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => navigate('/group')}
          className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
        >
          ← {store.group.name}
        </button>
      </div>

      {/* 설정 버튼 (소유자 전용) */}
      {store.currentUserId && store.group && store.currentUserId === store.group.created_by && (
        <div className="absolute top-4 right-4 z-10">
          <a
            href={`/group/${id}/settings`}
            aria-label="설정"
            className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
          >
            ⚙ 설정
          </a>
        </div>
      )}
    </div>
  );
});
