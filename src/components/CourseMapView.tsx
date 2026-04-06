import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MapPin, TrendingUp, ArrowRight, Crosshair, Search } from 'lucide-react';
import { MapStore } from '../stores/MapStore';
import { supabase } from '../lib/supabase';
import type { Course } from '../types/course';

const formatDistance = (m: number | null): string => {
  if (m === null) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
};

interface Props {
  courses: Course[];
  onClose: () => void;
}

export const CourseMapView = ({ courses, onClose }: Props) => {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapStore] = useState(() => new MapStore());
  const [selected, setSelected] = useState<Course | null>(null);
  const [, setGpxText] = useState<string | null>(null);
  const [gpxLoading, setGpxLoading] = useState(false);
  const [query, setQuery] = useState('');
  const markersRef = useRef<naver.maps.Marker[]>([]);

  const searchResults = query.trim()
    ? courses.filter((c) => {
        const q = query.trim().toLowerCase();
        return c.name.toLowerCase().includes(q) || (c.region ?? '').toLowerCase().includes(q);
      })
    : [];

  // 바텀시트 높이 측정
// 지도 초기화
  useEffect(() => {
    if (!mapRef.current) return;
    mapStore.initMap(mapRef.current);
    return () => mapStore.destroy();
  }, [mapStore]);

  // 핀 렌더링
  useEffect(() => {
    if (!mapStore.map) return;

    // 기존 핀 제거
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const withCoords = courses.filter((c: Course) => c.start_lat != null && c.start_lng != null);

    withCoords.forEach((course: Course) => {
      const marker = new window.naver.maps.Marker({
        map: mapStore.map!,
        position: new window.naver.maps.LatLng(course.start_lat!, course.start_lng!),
        icon: {
          content: `<div style="
            background: black;
            color: white;
            border-radius: 999px;
            padding: 4px 10px;
            font-size: 12px;
            font-weight: 700;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            cursor: pointer;
          ">${course.name}</div>`,
          anchor: new window.naver.maps.Point(0, 0),
        },
      });

      window.naver.maps.Event.addListener(marker, 'click', () => {
        setSelected(course);
      });

      markersRef.current.push(marker);
    });

    // 핀이 있으면 전체가 보이도록 bounds 조정
    if (withCoords.length > 0) {
      const bounds = new window.naver.maps.LatLngBounds(
        new window.naver.maps.LatLng(withCoords[0].start_lat!, withCoords[0].start_lng!),
        new window.naver.maps.LatLng(withCoords[0].start_lat!, withCoords[0].start_lng!),
      );
      withCoords.forEach((c: Course) => bounds.extend(new window.naver.maps.LatLng(c.start_lat!, c.start_lng!)));
      mapStore.map.fitBounds(bounds, { top: 60, right: 40, bottom: 60, left: 40 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStore.map, courses]);

  // 선택된 코스 GPX 로드 및 경로 표시
  useEffect(() => {
    if (!selected) {
      mapStore.clearGpxRoute();
      setGpxText(null);
      return;
    }

    let cancelled = false;
    setGpxLoading(true);
    setGpxText(null);
    mapStore.clearGpxRoute();

    (async () => {
      const { data, error } = await supabase.storage
        .from('course-gpx')
        .createSignedUrl(selected.gpx_path, 3600);
      if (cancelled || error || !data?.signedUrl) { setGpxLoading(false); return; }

      try {
        const res = await fetch(data.signedUrl);
        if (!res.ok || cancelled) { setGpxLoading(false); return; }
        const text = await res.text();
        if (cancelled) return;
        setGpxText(text);
        mapStore.drawGpxRoute(text);
        mapStore.returnToCourse();
      } catch {
        // silent
      } finally {
        if (!cancelled) setGpxLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selected, mapStore]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* 상단 코스 정보 */}
      {selected && (
        <div className="bg-white border-b border-black/[0.06] px-5 pt-4 pb-4">
          <div className="relative">
            <button
              onClick={() => setSelected(null)}
              className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center text-black/30 active:text-black/60"
              aria-label="닫기"
            >
              <X size={16} />
            </button>
            <p className="text-[16px] font-bold text-black leading-snug pr-10 mb-1">{selected.name}</p>
            <div className="flex items-center gap-3 flex-wrap">
              {selected.region && (
                <span className="flex items-center gap-1 text-[12px] text-black/40 font-medium whitespace-nowrap">
                  <MapPin size={11} strokeWidth={2.5} />
                  {selected.region}
                </span>
              )}
              <span className="flex items-center gap-1 text-[12px] text-black/40 font-medium whitespace-nowrap">
                <MapPin size={11} strokeWidth={2.5} />
                {formatDistance(selected.distance_m)}
              </span>
              {selected.elevation_gain_m != null && (
                <span className="flex items-center gap-1 text-[12px] text-black/40 font-medium whitespace-nowrap">
                  <TrendingUp size={11} strokeWidth={2.5} />
                  {selected.elevation_gain_m} m
                </span>
              )}
            </div>
            {selected.tags && selected.tags.length > 0 && (
              <div className="flex gap-1.5 mt-2">
                {selected.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="px-2 py-0.5 bg-black/[0.04] rounded-md text-[10px] font-semibold text-black/40">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-3">
              <button
                onClick={() => navigate(`/course/${selected.id}`)}
                className="flex items-center gap-1 px-4 py-2 bg-black text-white rounded-full text-[13px] font-semibold active:scale-95 transition-transform"
              >
                자세히
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 검색바 — 코스 선택 전에만 표시 */}
      {!selected && (
        <div className="absolute top-4 left-4 right-4 z-10 flex flex-col gap-1.5">
          {/* 인풋 */}
          <div className="relative bg-white/95 backdrop-blur-md rounded-xl shadow-lg shadow-black/10 border border-black/[0.06]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none" strokeWidth={2.5} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="코스 검색"
              className="w-full pl-9 pr-9 py-2.5 bg-transparent text-[14px] outline-none placeholder:text-black/30"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center text-black/30 active:text-black/60"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            )}
          </div>

          {/* 결과 패널 */}
          {searchResults.length > 0 && (
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg shadow-black/10 border border-black/[0.06] overflow-hidden">
              {searchResults.slice(0, 6).map((course, i) => (
                <button
                  key={course.id}
                  onClick={() => { setSelected(course); setQuery(''); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-black/[0.04] transition-colors ${i > 0 ? 'border-t border-black/[0.04]' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-black leading-snug truncate">{course.name}</p>
                    {course.region && (
                      <p className="text-[11px] text-black/35 leading-snug mt-0.5">{course.region}</p>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-black/30 shrink-0 tabular-nums">{formatDistance(course.distance_m)}</span>
                </button>
              ))}
              {searchResults.length > 6 && (
                <p className="text-center text-[11px] text-black/30 py-2 border-t border-black/[0.04]">
                  +{searchResults.length - 6}개 더
                </p>
              )}
            </div>
          )}

          {/* 결과 없음 */}
          {query.trim() && searchResults.length === 0 && (
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg shadow-black/10 border border-black/[0.06] px-3 py-3">
              <p className="text-[12px] text-black/30 text-center">검색 결과 없음</p>
            </div>
          )}
        </div>
      )}

      {/* 지도 */}
      <div ref={mapRef} className="flex-1 w-full relative">
        {gpxLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* 내 위치 버튼 */}
      <button
        onClick={() => mapStore.locate()}
        className="absolute right-4 bottom-10 z-10 w-10 h-10 bg-white rounded-xl shadow-lg shadow-black/10 border border-black/[0.06] flex items-center justify-center active:scale-95 transition-transform"
        aria-label="내 위치"
      >
        <Crosshair size={18} className="text-black/60" />
      </button>

      {/* 리스트 버튼 */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-5 py-3 bg-white text-black/70 rounded-full text-[14px] font-semibold shadow-lg shadow-black/10 border border-black/[0.06] active:scale-95 transition-transform"
          aria-label="리스트로 돌아가기"
        >
          <X size={15} />
          리스트
        </button>
      </div>
    </div>
  );
};
