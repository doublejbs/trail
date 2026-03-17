import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Crosshair } from 'lucide-react';
import { MapStore } from '../stores/MapStore';
import { DUMMY_GROUPS } from '../data/groups';

export const GroupMapPage = observer(() => {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [store] = useState(() => new MapStore());
  const group = DUMMY_GROUPS.find((g) => g.id === Number(id));

  useEffect(() => {
    if (!mapRef.current || !group) return;
    store.initMap(mapRef.current);
    return () => store.destroy();
    // group excluded from deps: re-running initMap/destroy on re-render would
    // break the Naver Maps SDK lifecycle. The !group guard handles the render
    // before <Navigate> below is committed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  if (!group) return <Navigate to="/group" replace />;

  return (
    <div className="absolute inset-0">
      {/* 네이버 지도 컨테이너 */}
      <div
        ref={mapRef}
        data-testid="map-container"
        className="absolute inset-0 w-full h-full"
      />

      {/* 에러 오버레이 */}
      {store.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
          <p className="text-sm text-neutral-500">지도를 불러올 수 없습니다</p>
        </div>
      )}

      {/* 내 위치 버튼 */}
      {store.map && (
        <div className="absolute right-3 bottom-3">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => store.locate()}
            aria-label="내 위치"
            className="bg-white hover:bg-neutral-50 shadow-md"
          >
            <Crosshair size={18} className="text-neutral-700" />
          </Button>
        </div>
      )}

      {/* 뒤로가기 버튼 */}
      <div className="absolute top-4 left-4">
        <button
          onClick={() => navigate('/group')}
          className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
        >
          ← {group.name}
        </button>
      </div>
    </div>
  );
});
