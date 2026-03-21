import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseGpxCoords, normaliseCoordsToSvgPoints } from '../lib/gpx';
import type { Course } from '../types/course';

const THUMB_W = 160;
const THUMB_H = 100;

function formatDistance(m: number | null): string {
  if (m === null) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
}

interface Props {
  course: Course;
  likeCount: number;
  onClick: () => void;
}

export function CourseCard({ course, likeCount, onClick }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [svgPoints, setSvgPoints] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();

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
          setSvgPoints(points);
        } catch {
          setThumbError(true);
        }
      },
      { rootMargin: '200px', threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [course.gpx_path]);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className="flex flex-col rounded-2xl overflow-hidden border border-neutral-100 bg-white shadow-sm active:opacity-80 cursor-pointer"
    >
      {/* Thumbnail */}
      <svg
        width={THUMB_W}
        height={THUMB_H}
        viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
        className="bg-neutral-100 w-full"
        style={{ height: THUMB_H }}
      >
        {thumbError || (!svgPoints && !thumbError) ? (
          <rect width={THUMB_W} height={THUMB_H} fill="#e5e5e5" rx="0" />
        ) : svgPoints ? (
          svgPoints.split(' ').length === 1 ? (
            /* single point */
            <circle cx={svgPoints.split(',')[0]} cy={svgPoints.split(',')[1]} r="4" fill="#FF5722" />
          ) : (
            <polyline
              points={svgPoints}
              fill="none"
              stroke="#FF5722"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        ) : null}
      </svg>

      {/* Info */}
      <div className="flex flex-col gap-1 p-3">
        <p className="text-sm font-semibold text-black line-clamp-1">{course.name}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">{formatDistance(course.distance_m)}</span>
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <Heart size={12} />
            {likeCount}
          </span>
        </div>
      </div>
    </div>
  );
}
