import { useEffect, useRef, useState } from 'react';
import { Heart, MapPin, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseGpxCoords, normaliseCoordsToSvgPoints } from '../lib/gpx';
import type { Course } from '../types/course';

const THUMB_W = 96;
const THUMB_H = 96;

function formatDistance(m: number | null): string {
  if (m === null) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
}

function formatElevation(m: number | null): string {
  if (m === null) return '';
  return `${m} m`;
}

interface Props {
  course: Course;
  likeCount: number;
  onClick: () => void;
}

export function CourseCard({ course, likeCount, onClick }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [svgPoints, setSvgPoints] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      async ([entry], observerInstance) => {
        if (!entry?.isIntersecting) return;
        observerInstance.disconnect();

        if (course.thumbnail_path) {
          try {
            const { data, error } = await supabase.storage
              .from('course-gpx')
              .createSignedUrl(course.thumbnail_path, 3600);
            if (!error && data?.signedUrl) {
              setThumbnailUrl(data.signedUrl);
              return;
            }
          } catch {
            // Fall through to SVG fallback
          }
        }

        try {
          const { data, error } = await supabase.storage
            .from('course-gpx')
            .createSignedUrl(course.gpx_path, 3600);

          if (error || !data?.signedUrl) { setThumbError(true); return; }

          const res = await fetch(data.signedUrl);
          if (!res.ok) { setThumbError(true); return; }

          const text = await res.text();
          const coords = parseGpxCoords(text);
          if (!coords) { setThumbError(true); return; }

          const points = normaliseCoordsToSvgPoints(coords, THUMB_W, THUMB_H);
          if (!points) { setThumbError(true); return; }
          setSvgPoints(points);
        } catch {
          setThumbError(true);
        }
      },
      { rootMargin: '200px', threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [course.gpx_path, course.thumbnail_path]);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className="flex items-stretch gap-4 rounded-2xl bg-white border border-black/[0.06] active:scale-[0.98] transition-transform duration-150 cursor-pointer p-3"
    >
      {/* Thumbnail */}
      <div
        className="relative shrink-0 rounded-xl overflow-hidden bg-black/[0.03]"
        style={{ width: THUMB_W, height: THUMB_H }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={course.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <svg
            width={THUMB_W}
            height={THUMB_H}
            viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
            className="block"
          >
            {thumbError || (!svgPoints && !thumbError) ? (
              <rect width={THUMB_W} height={THUMB_H} fill="#f0eeeb" />
            ) : svgPoints ? (
              !svgPoints.includes(' ') ? (
                <circle cx={svgPoints.split(',')[0]} cy={svgPoints.split(',')[1]} r="4" fill="black" />
              ) : (
                <polyline
                  points={svgPoints}
                  fill="none"
                  stroke="black"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity="0.5"
                />
              )
            ) : null}
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <p className="text-[15px] font-bold text-black leading-snug line-clamp-1">{course.name}</p>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-[12px] text-black/40 font-medium">
              <MapPin size={11} strokeWidth={2.5} />
              {formatDistance(course.distance_m)}
            </span>
            {course.elevation_gain_m != null && (
              <span className="flex items-center gap-1 text-[12px] text-black/40 font-medium">
                <TrendingUp size={11} strokeWidth={2.5} />
                {formatElevation(course.elevation_gain_m)}
              </span>
            )}
          </div>
        </div>

        {/* Bottom row: tags + likes */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {course.tags?.slice(0, 2).map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-black/[0.04] rounded-md text-[10px] font-semibold text-black/40 tracking-wide">
                {tag}
              </span>
            ))}
          </div>
          <span className="flex items-center gap-1 text-[11px] text-black/25 font-medium">
            <Heart size={11} />
            {likeCount}
          </span>
        </div>
      </div>
    </div>
  );
}
