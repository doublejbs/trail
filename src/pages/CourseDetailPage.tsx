// src/pages/CourseDetailPage.tsx
import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Heart, Send } from 'lucide-react';
import { toast } from 'sonner';
import { CourseDetailStore } from '../stores/CourseDetailStore';
import { MapStore } from '../stores/MapStore';
import { ElevationChart } from '../components/ElevationChart';
import { supabase } from '../lib/supabase';

export const CourseDetailPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new CourseDetailStore(id!));
  const [mapStore] = useState(() => new MapStore());
  const mapRef = useRef<HTMLDivElement>(null);
  const [gpxText, setGpxText] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    store.fetch();
  }, [store]);

  // Fetch GPX once course is loaded
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

  // Init map + draw route
  useEffect(() => {
    if (!mapRef.current || gpxText === undefined || store.loading) return;

    mapStore.initMap(mapRef.current);
    if (gpxText) mapStore.drawGpxRoute(gpxText);

    return () => mapStore.destroy();
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
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (store.notFound) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white">
        <p className="text-sm text-neutral-500">코스를 찾을 수 없습니다</p>
        <button
          onClick={() => navigate('/course')}
          className="px-4 py-2 rounded-lg bg-black text-white text-sm font-medium"
        >
          코스 목록으로
        </button>
      </div>
    );
  }

  const course = store.course!;
  const MAP_HEIGHT = '45vh';

  return (
    <div className="absolute inset-0 bg-white">
      {/* Map */}
      <div className="absolute inset-x-0 top-0" style={{ height: MAP_HEIGHT }}>
        <div ref={mapRef} data-testid="map-container" className="absolute inset-0 w-full h-full" />

        {mapStore.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
            <p className="text-sm text-neutral-500">지도를 불러올 수 없습니다</p>
          </div>
        )}

        {/* Back button */}
        <div className="absolute top-4 left-4">
          <button
            onClick={() => navigate('/course')}
            className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
          >
            ← 코스
          </button>
        </div>
      </div>

      {/* Scrollable detail */}
      <div className="absolute inset-x-0 overflow-y-auto" style={{ top: MAP_HEIGHT, bottom: 0 }}>
        {/* Title + stats */}
        <div className="px-4 pt-4 pb-3 border-b border-neutral-100">
          <h1 className="text-lg font-bold text-black mb-2">{course.name}</h1>
          <div className="flex gap-4 text-sm text-neutral-500">
            <span>거리 {course.distance_m !== null ? `${(course.distance_m / 1000).toFixed(1)} km` : '—'}</span>
            <span>고도 {course.elevation_gain_m !== null ? `+${course.elevation_gain_m} m` : '—'}</span>
          </div>
          {course.description && (
            <p className="text-sm text-neutral-600 mt-2">{course.description}</p>
          )}
          {course.tags && course.tags.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {course.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 bg-neutral-100 rounded-full text-xs text-neutral-600">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {typeof gpxText === 'string' && (
          <div className="border-b border-neutral-100">
            <ElevationChart gpxText={gpxText} />
          </div>
        )}

        {/* Like */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100">
          <button
            onClick={handleLike}
            disabled={store.likeLoading}
            aria-label="좋아요"
            className="flex items-center gap-1.5"
          >
            <Heart
              size={20}
              className={store.userHasLiked ? 'fill-red-500 text-red-500' : 'text-neutral-400'}
            />
            <span className="text-sm text-neutral-600">{store.likeCount}</span>
          </button>
        </div>

        {/* Comments */}
        <div className="px-4 pt-3 pb-20">
          <h2 className="text-sm font-semibold mb-3">댓글 {store.comments.length}</h2>

          {store.comments.length === 0 && (
            <p className="text-xs text-neutral-400 mb-4">첫 댓글을 남겨보세요</p>
          )}

          <div className="flex flex-col gap-3 mb-4">
            {store.comments.map((comment) => (
              <div key={comment.id} className="flex flex-col gap-0.5">
                <p className="text-sm text-black">{comment.body}</p>
                <p className="text-xs text-neutral-400">
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
              className="flex-1 bg-neutral-100 rounded-full px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={!store.commentBody.trim() || store.commentSubmitting}
              aria-label="댓글 전송"
              className="flex items-center justify-center w-9 h-9 rounded-full bg-black text-white disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});

