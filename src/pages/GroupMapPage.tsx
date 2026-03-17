import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { Button } from '@/components/ui/button';
import { Crosshair } from 'lucide-react';
import { MapStore } from '../stores/MapStore';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

export const GroupMapPage = observer(() => {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [store] = useState(() => new MapStore());
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [gpxText, setGpxText] = useState<string | null | undefined>(undefined);

  // Effect 1: Fetch group + GPX (no DOM dependency)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Supabase에서 그룹 조회
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .single();

      if (cancelled) return;

      if (error || !data) {
        setGroup(null);
        return;
      }

      setGroup(data as Group);

      // 2. Signed URL 생성
      const { data: urlData, error: urlError } = await supabase.storage
        .from('gpx-files')
        .createSignedUrl((data as Group).gpx_path, 3600);

      if (cancelled) return;

      if (urlError || !urlData?.signedUrl) {
        setGpxText(null);
        return;
      }

      // 3. GPX 텍스트 fetch
      try {
        const response = await fetch(urlData.signedUrl);
        if (!response.ok) throw new Error('GPX fetch failed');
        const text = await response.text();
        if (!cancelled) {
          setGpxText(text);
        }
      } catch {
        if (!cancelled) {
          setGpxText(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Effect 2: Init map + draw route once DOM ref & GPX text are ready
  useEffect(() => {
    if (!mapRef.current || gpxText === undefined || group === undefined || group === null) {
      return () => { store.destroy(); };
    }

    store.initMap(mapRef.current);

    if (gpxText !== null) {
      store.drawGpxRoute(gpxText);
    } else {
      runInAction(() => { store.error = true; });
    }

    return () => {
      store.destroy();
    };
  }, [store, gpxText, group]);

  // 그룹 없음 → 리다이렉트 (로딩 완료 여부와 무관하게 즉시)
  if (group === null) return <Navigate to="/group" replace />;

  // 로딩 중
  if (group === undefined || gpxText === undefined) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div
          role="status"
          className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"
        />
      </div>
    );
  }

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
