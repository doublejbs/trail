// src/pages/CoursePage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus } from 'lucide-react';
import { CourseStore } from '../stores/CourseStore';
import { CourseCard } from '../components/CourseCard';
import { LargeTitle } from '../components/LargeTitle';

const FILTERS = [
  { key: 'all' as const, label: '전체' },
  { key: 'mine' as const, label: '내 코스' },
];

export const CoursePage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new CourseStore());

  useEffect(() => {
    store.fetchPage();
  }, [store]);

  const handleFilterChange = (key: 'all' | 'mine') => {
    store.setFilter(key);
    store.fetchPage();
  };

  return (
    <div className="relative flex flex-col h-full bg-white">
      <LargeTitle title="탐색" />

      {/* Filter chips */}
      <div className="flex gap-1.5 px-5 pb-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-semibold min-h-0 min-w-0 transition-colors ${
              store.filter === f.key
                ? 'bg-black text-white'
                : 'bg-black/[0.05] text-black/45'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Course grid */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {store.loading && store.courses.length === 0 && (
          <div className="flex justify-center pt-16">
            <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
          </div>
        )}

        {!store.loading && store.courses.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-black/[0.04] flex items-center justify-center">
              <Compass size={20} className="text-black/20" />
            </div>
            <p className="text-[13px] text-black/35">코스가 없습니다</p>
          </div>
        )}

        {store.error && (
          <p className="text-[12px] text-red-500 text-center pt-4">{store.error}</p>
        )}

        <div className="flex flex-col gap-3">
          {store.courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              likeCount={0}
              onClick={() => navigate(`/course/${course.id}`)}
            />
          ))}
        </div>
      </div>

      {/* FAB */}
      <div className="absolute right-5 bottom-4">
        <button
          onClick={() => navigate('/course/new')}
          aria-label="코스 업로드"
          className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center shadow-lg shadow-black/20 active:scale-95 transition-transform"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
});

function Compass({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88"/>
    </svg>
  );
}
