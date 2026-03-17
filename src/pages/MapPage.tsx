import { useRef, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Crosshair } from 'lucide-react';
import { MapStore } from '../stores/MapStore';

export const MapPage = observer(() => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [store] = useState(() => new MapStore());

  useEffect(() => {
    if (mapRef.current) {
      store.initMap(mapRef.current);
    }
  }, [store]);

  return (
    <div className="relative w-full h-full">
      {/* 네이버 지도 컨테이너 */}
      <div
        ref={mapRef}
        data-testid="map-container"
        className="absolute inset-0"
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
    </div>
  );
});
