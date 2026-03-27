import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Course } from '../types/course';

interface Props {
  course: Course;
  size?: number;
  className?: string;
}

export function CourseThumbnail({ course, size = 56, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!course.thumbnail_path) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      async ([entry], obs) => {
        if (!entry?.isIntersecting) return;
        obs.disconnect();
        try {
          const { data, error } = await supabase.storage
            .from('course-gpx')
            .createSignedUrl(course.thumbnail_path!, 3600);
          if (!error && data?.signedUrl) setUrl(data.signedUrl);
        } catch { /* ignore */ }
      },
      { rootMargin: '200px', threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [course.thumbnail_path]);

  return (
    <div
      ref={ref}
      className={`shrink-0 rounded-lg overflow-hidden bg-[#f3f3f0] ${className}`}
      style={{ width: size, height: size }}
    >
      {url && (
        <img src={url} alt={course.name} className="w-full h-full object-cover" />
      )}
    </div>
  );
}
