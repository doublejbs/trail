// src/pages/CourseDetailPage.tsx
import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Heart, Send, Mountain, Route } from 'lucide-react';
import { toast } from 'sonner';
import { CourseDetailStore } from '../stores/CourseDetailStore';
import { MapStore } from '../stores/MapStore';
import { NavigationBar } from '../components/NavigationBar';
import { ElevationChart } from '../components/ElevationChart';
import { supabase } from '../lib/supabase';

export const CourseDetailPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new CourseDetailStore(id!));
  const [mapStore] = useState(() => new MapStore());
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<naver.maps.Map | null>(null);
  const [gpxText, setGpxText] = useState<string | null | undefined>(undefined);
  const elevationMarkerRef = useRef<naver.maps.Marker | null>(null);

  useEffect(() => {
    store.fetch();
  }, [store]);

  useEffect(() => {
    if (!store.course) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.storage
        .from('course-gpx')
        .createSignedUrl(store.course!.gpx_path, 3600);

      if (cancelled) return;
      if (error || !data?.signedUrl) { setGpxText(null); return; }

      try {
        const res = await fetch(data.signedUrl);
        if (!res.ok) { setGpxText(null); return; }
        const text = await res.text();
        if (!cancelled) setGpxText(text);
      } catch {
        if (!cancelled) setGpxText(null);
      }
    })();

    return () => { cancelled = true; };
  }, [store.course]);

  useEffect(() => {
    if (!mapRef.current || gpxText === undefined || store.loading) return;

    mapStore.initMap(mapRef.current);
    mapInstanceRef.current = mapStore.map;
    if (gpxText) {
      mapStore.drawGpxRoute(gpxText);
      mapStore.returnToCourse();
    }

    return () => {
      mapStore.destroy();
      mapInstanceRef.current = null;
    };
  }, [mapStore, gpxText, store.loading]);

  const handleLike = async () => {
    await store.toggleLike();
    if (store.error) toast.error('좋아요 처리 중 오류가 발생했습니다');
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await store.submitComment();
  };

  if (store.loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white">
        <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (store.notFound) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white">
        <p className="text-[14px] text-black/40">코스를 찾을 수 없습니다</p>
        <button
          onClick={() => navigate('/course')}
          className="px-5 py-2.5 rounded-xl bg-black text-white text-[14px] font-semibold"
        >
          코스 목록으로
        </button>
      </div>
    );
  }

  const course = store.course!;
  const MAP_HEIGHT = '42vh';

  return (
    <div className="absolute inset-0 bg-white">
      {/* Map */}
      <div className="absolute inset-x-0 top-0" style={{ height: MAP_HEIGHT }}>
        <NavigationBar
          title=""
          onBack={() => navigate(-1)}
          overlay
        />
        <div ref={mapRef} data-testid="map-container" className="absolute inset-0 w-full h-full" />

        {mapStore.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#f3f3f0]">
            <p className="text-[13px] text-black/35">지도를 불러올 수 없습니다</p>
          </div>
        )}
      </div>

      {/* Scrollable detail */}
      <div
        className="absolute inset-x-0 overflow-y-auto bg-white"
        style={{ top: MAP_HEIGHT, bottom: 0 }}
      >
        {/* Title + stats */}
        <div className="px-5 pt-5 pb-4">
          <h1 className="text-[20px] font-extrabold text-black tracking-tight mb-3">{course.name}</h1>

          <div className="flex gap-3">
            <div className="flex items-center gap-1.5 bg-black/[0.04] rounded-xl px-3 py-2">
              <Route size={14} className="text-black/35" />
              <span className="text-[13px] font-semibold text-black/60">
                {course.distance_m !== null ? `${(course.distance_m / 1000).toFixed(1)} km` : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-black/[0.04] rounded-xl px-3 py-2">
              <Mountain size={14} className="text-black/35" />
              <span className="text-[13px] font-semibold text-black/60">
                {course.elevation_gain_m !== null ? `+${course.elevation_gain_m} m` : '—'}
              </span>
            </div>
          </div>

          {course.description && (
            <p className="text-[14px] text-black/55 mt-3 leading-relaxed">{course.description}</p>
          )}
          {course.tags && course.tags.length > 0 && (
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {course.tags.map((tag) => (
                <span key={tag} className="px-2.5 py-1 bg-black/[0.04] rounded-full text-[11px] font-semibold text-black/45">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {typeof gpxText === 'string' && (
          <div className="border-t border-black/[0.04]">
            <ElevationChart
              gpxText={gpxText}
              onActiveCoord={(coord) => {
                const map = mapInstanceRef.current;
                if (!coord || !map) {
                  elevationMarkerRef.current?.setMap(null);
                  elevationMarkerRef.current = null;
                  return;
                }
                const pos = new window.naver.maps.LatLng(coord.lat, coord.lon);
                if (elevationMarkerRef.current) {
                  elevationMarkerRef.current.setPosition(pos);
                } else {
                  elevationMarkerRef.current = new window.naver.maps.Marker({
                    map,
                    position: pos,
                    icon: {
                      content: '<div style="width:16px;height:16px;border-radius:50%;background:#FF5722;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>',
                      anchor: new window.naver.maps.Point(8, 8),
                    },
                  });
                }
              }}
            />
          </div>
        )}

        {/* Like */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-black/[0.04]">
          <button
            onClick={handleLike}
            disabled={store.likeLoading}
            aria-label="좋아요"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors active:bg-black/[0.03]"
          >
            <Heart
              size={18}
              className={store.userHasLiked ? 'fill-red-500 text-red-500' : 'text-black/25'}
            />
            <span className={`text-[13px] font-semibold ${store.userHasLiked ? 'text-red-500' : 'text-black/40'}`}>
              {store.likeCount}
            </span>
          </button>
        </div>

        {/* Comments */}
        <div className="px-5 pt-2 pb-28">
          <h2 className="text-[14px] font-bold text-black mb-3">댓글 {store.comments.length}</h2>

          {store.comments.length === 0 && (
            <p className="text-[13px] text-black/25 mb-4">첫 댓글을 남겨보세요</p>
          )}

          <div className="flex flex-col gap-4 mb-5">
            {store.comments.map((comment) => (
              <div key={comment.id} className="flex flex-col gap-0.5">
                <p className="text-[14px] text-black/80">{comment.body}</p>
                <p className="text-[11px] text-black/25">
                  {new Date(comment.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
            ))}
          </div>

          {/* Comment input */}
          <form onSubmit={handleCommentSubmit} className="flex gap-2">
            <input
              type="text"
              value={store.commentBody}
              onChange={(e) => store.setCommentBody(e.target.value)}
              placeholder="댓글을 입력하세요"
              className="flex-1 bg-black/[0.04] rounded-full px-4 py-2.5 text-[14px] outline-none placeholder:text-black/25"
            />
            <button
              type="submit"
              disabled={!store.commentBody.trim() || store.commentSubmitting}
              aria-label="댓글 전송"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-black text-white disabled:opacity-25 active:bg-black/80 transition-colors"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});
