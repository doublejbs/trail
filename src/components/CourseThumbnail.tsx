import { supabase } from '../lib/supabase';
import type { Course } from '../types/course';

interface Props {
  course: Course;
  size?: number;
  className?: string;
}

export const CourseThumbnail = ({ course, size = 56, className = '' }: Props) => {
  const url = course.thumbnail_path
    ? supabase.storage.from('course-gpx').getPublicUrl(course.thumbnail_path).data.publicUrl
    : null;

  return (
    <div
      className={`shrink-0 rounded-lg overflow-hidden bg-[#f3f3f0] ${className}`}
      style={{ width: size, height: size }}
    >
      {url && (
        <img src={url} alt={course.name} loading="lazy" className="w-full h-full object-cover" />
      )}
    </div>
  );
};
