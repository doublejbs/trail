// src/pages/CourseDetailPage.tsx
import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { makeAutoObservable, runInAction } from 'mobx';
import type { NavigateFunction } from 'react-router-dom';
import { Heart, Send, Mountain, Route } from 'lucide-react';
import { toast } from 'sonner';
import { CourseDetailStore } from '../stores/CourseDetailStore';
import { MapStore } from '../stores/MapStore';
import { NavigationBar } from '../components/NavigationBar';
import { ElevationChart } from '../components/ElevationChart';
import { supabase } from '../lib/supabase';
import { parseGpxCoords, computeDistanceM } from '../lib/gpx';
import type { Course } from '../types/course';

class QuickGroupCreateStore {
  public name = '';
  public submitting = false;
  private course: Course;
  private nav: NavigateFunction;

  constructor(course: Course, navigate: NavigateFunction) {
    this.course = course;
    this.nav = navigate;
    makeAutoObservable(this);
  }

  public setName(v: string) { this.name = v; }

  public get canSubmit() { return this.name.trim().length > 0 && !this.submitting; }

  public async create() {
    if (!this.canSubmit) return;
    runInAction(() => { this.submitting = true; });

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      runInAction(() => { this.submitting = false; });
      toast.error('로그인이 필요합니다');
      return;
    }

    const groupId = crypto.randomUUID();
    const { error } = await supabase.from('groups').insert({
      id: groupId,
      name: this.name.trim(),
      created_by: userId,
      gpx_path: this.course.gpx_path,
      gpx_bucket: 'course-gpx',
      thumbnail_path: this.course.thumbnail_path ?? null,
    });

    if (error) {
      runInAction(() => { this.submitting = false; });
      toast.error('그룹 생성에 실패했습니다');
      return;
    }

    // 종료 체크포인트 자동 생성
    try {
      const { data: urlData } = await supabase.storage
        .from('course-gpx')
        .createSignedUrl(this.course.gpx_path, 60);
      if (urlData?.signedUrl) {
        const resp = await fetch(urlData.signedUrl);
        if (resp.ok) {
          const gpxText = await resp.text();
          const coords = parseGpxCoords(gpxText);
          if (coords && coords.length >= 2) {
            const lastCoord = coords[coords.length - 1];
            const totalDist = computeDistanceM(coords);
            await supabase.from('checkpoints').insert({
              group_id: groupId,
              name: '종료',
              lat: lastCoord.lat,
              lng: lastCoord.lon,
              radius_m: 30,
              sort_order: totalDist,
              is_finish: true,
            });
          }
        }
      }
    } catch {
      // 체크포인트 생성 실패해도 그룹 생성은 성공으로 처리
    }

    runInAction(() => { this.submitting = false; });
    this.nav(`/group/${groupId}`);
  }
}

export const CourseDetailPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new CourseDetailStore(id!));
  const [mapStore] = useState(() => new MapStore());
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<naver.maps.Map | null>(null);
  const [gpxText, setGpxText] = useState<string | null | undefined>(undefined);
  const elevationMarkerRef = useRef<naver.maps.Marker | null>(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [quickStore, setQuickStore] = useState<QuickGroupCreateStore | null>(null);

  const openSheet = () => {
    if (!store.course) return;
    const qs = new QuickGroupCreateStore(store.course, navigate);
    setQuickStore(qs);
    setShowCreateSheet(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSheetVisible(true);
        setTimeout(() => inputRef.current?.focus(), 320);
      });
    });
  };

  const closeSheet = () => {
    setSheetVisible(false);
    setTimeout(() => { setShowCreateSheet(false); setQuickStore(null); }, 300);
  };

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

  // 지도 초기화 — GPX start 좌표 기반, 없으면 서울
  useEffect(() => {
    if (!mapRef.current || store.loading) return;
    const c = store.course;
    mapStore.initMap(
      mapRef.current,
      c?.start_lat && c?.start_lng ? { lat: c.start_lat, lng: c.start_lng } : undefined,
    );
    mapInstanceRef.current = mapStore.map;
    return () => {
      mapStore.destroy();
      mapInstanceRef.current = null;
    };
  }, [mapStore, store.loading]);

  // GPX 준비되면 경로 그리기
  useEffect(() => {
    if (!gpxText || !mapStore.map) return;
    mapStore.drawGpxRoute(gpxText);
    mapStore.returnToCourse();
  }, [mapStore, gpxText]);

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
    <div className="absolute inset-0 flex flex-col bg-white">
      <NavigationBar title="" onBack={() => navigate(-1)} />

      {/* Map */}
      <div className="shrink-0 relative" style={{ height: MAP_HEIGHT }}>
        <div ref={mapRef} data-testid="map-container" className="absolute inset-0 w-full h-full" />

        {/* GPX 로딩 중 — shimmer + 경로 탐색 pulse (경로 그려질 때까지 유지) */}
        {!mapStore.gpxPolyline && !mapStore.error && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* shimmer sweep */}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(108deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)',
                animation: 'shimmer 2.2s ease-in-out infinite',
              }}
            />
            {/* 경로 탐색 pulse — 지도 중앙 */}
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

        {mapStore.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#f3f3f0]">
            <p className="text-[13px] text-black/35">지도를 불러올 수 없습니다</p>
          </div>
        )}
      </div>

      {/* Scrollable detail */}
      <div className="flex-1 overflow-y-auto bg-white" style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
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

        {gpxText === undefined && (
          <div className="border-t border-black/[0.04] px-4 pt-3 pb-2">
            <svg
              viewBox="0 0 360 140"
              width="100%"
              height="140"
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: 'block' }}
            >
              <defs>
                <linearGradient id="skelElevFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="black" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="black" stopOpacity="0.005" />
                </linearGradient>
              </defs>

              {/* 수평 grid 선 */}
              <g stroke="black" strokeOpacity="0.05" strokeWidth="0.8">
                <line x1="0" y1="40" x2="360" y2="40" />
                <line x1="0" y1="72" x2="360" y2="72" />
                <line x1="0" y1="104" x2="360" y2="104" />
              </g>

              {/* fill 영역 (정적) */}
              <path
                d="M 0 108 C 28 106 46 94 68 78 S 102 52 128 38 S 158 24 178 22 S 200 28 224 40 S 258 56 288 52 S 322 44 360 40 L 360 120 L 0 120 Z"
                fill="url(#skelElevFill)"
              />

              {/* 고도선 — 좌→우 그리기 애니메이션 */}
              <path
                d="M 0 108 C 28 106 46 94 68 78 S 102 52 128 38 S 158 24 178 22 S 200 28 224 40 S 258 56 288 52 S 322 44 360 40"
                fill="none"
                stroke="black"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="900"
                strokeDashoffset="900"
                style={{ animation: 'drawChart 2.8s ease-in-out infinite' }}
              />

              {/* x축 레이블 자리 */}
              <g fill="black" fillOpacity="0.1">
                <rect x="0"   y="128" width="24" height="5" rx="2" />
                <rect x="85"  y="128" width="24" height="5" rx="2" />
                <rect x="170" y="128" width="24" height="5" rx="2" />
                <rect x="255" y="128" width="24" height="5" rx="2" />
                <rect x="333" y="128" width="24" height="5" rx="2" />
              </g>
            </svg>
          </div>
        )}

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
          {store.secondaryLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <div className="w-[18px] h-[18px] rounded-full bg-black/[0.07] animate-pulse" />
              <div className="w-5 h-3.5 rounded bg-black/[0.07] animate-pulse" />
            </div>
          ) : (
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
          )}
        </div>

        {/* Comments */}
        <div className="px-5 pt-2 pb-28">
          {store.secondaryLoading ? (
            <>
              <div className="w-16 h-4 rounded bg-black/[0.07] animate-pulse mb-4" />
              <div className="flex flex-col gap-4 mb-5">
                {[80, 60, 72].map((w) => (
                  <div key={w} className="flex flex-col gap-1.5">
                    <div className={`h-3.5 rounded bg-black/[0.07] animate-pulse`} style={{ width: `${w}%` }} />
                    <div className="w-12 h-2.5 rounded bg-black/[0.05] animate-pulse" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
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
            </>
          )}


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
      {/* Create group button */}
      <div
        className="absolute bottom-0 left-0 right-0 px-4 bg-white border-t border-black/[0.06]"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))', paddingTop: '12px' }}
      >
        <button
          onClick={openSheet}
          className="w-full py-3.5 rounded-2xl bg-black text-white text-[15px] font-bold active:bg-black/80 transition-colors"
        >
          이 코스로 그룹 만들기
        </button>
      </div>

      {/* Quick group create bottom sheet */}
      {showCreateSheet && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 transition-all duration-300"
            style={{ background: sheetVisible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)', backdropFilter: sheetVisible ? 'blur(4px)' : 'none' }}
            onClick={closeSheet}
          />

          {/* Sheet */}
          <div
            className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out"
            style={{
              transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pt-3 pb-5">
              {/* Course context */}
              <div className="flex items-center gap-3 mb-5 p-3 rounded-2xl bg-black/[0.03]">
                <div className="w-10 h-10 rounded-xl bg-black/[0.06] shrink-0 overflow-hidden flex items-center justify-center">
                  <Route size={16} className="text-black/30" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-black/30 mb-0.5">선택된 코스</p>
                  <p className="text-[14px] font-bold text-black truncate">{course.name}</p>
                </div>
              </div>

              {/* Label */}
              <p className="text-[13px] font-semibold text-black/40 mb-2">그룹 이름</p>

              {/* Input */}
              <div className="relative mb-4">
                <input
                  ref={inputRef}
                  type="text"
                  value={quickStore?.name ?? ''}
                  onChange={(e) => quickStore?.setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && quickStore?.canSubmit) void quickStore.create(); }}
                  placeholder="그룹 이름을 입력하세요"
                  maxLength={30}
                  className="w-full bg-black/[0.04] rounded-2xl px-4 py-3.5 text-[15px] font-medium text-black outline-none border-2 border-transparent focus:border-black/15 transition-all duration-200 placeholder:text-black/25"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-medium text-black/20 tabular-nums">
                  {quickStore?.name.length ?? 0}/30
                </span>
              </div>

              {/* Create button */}
              <button
                onClick={() => void quickStore?.create()}
                disabled={!quickStore?.canSubmit}
                className="w-full py-4 rounded-2xl text-[15px] font-bold transition-all duration-200 flex items-center justify-center gap-2"
                style={{
                  background: quickStore?.canSubmit ? '#000' : 'rgba(0,0,0,0.06)',
                  color: quickStore?.canSubmit ? '#fff' : 'rgba(0,0,0,0.25)',
                }}
              >
                {quickStore?.submitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  '그룹 만들기'
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
