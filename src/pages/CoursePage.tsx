// src/pages/CoursePage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus } from 'lucide-react';
import { CourseStore } from '../stores/CourseStore';
import { CourseCard } from '../components/CourseCard';

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
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-neutral-100">
        <h1 className="text-base font-semibold">코스</h1>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 px-4 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              store.filter === f.key
                ? 'bg-black text-white'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Course grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {store.loading && store.courses.length === 0 && (
          <div className="flex justify-center pt-16">
            <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!store.loading && store.courses.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-16 gap-2">
            <p className="text-sm text-neutral-400">코스가 없습니다</p>
          </div>
        )}

        {store.error && (
          <p className="text-xs text-red-500 text-center pt-4">{store.error}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
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
      <button
        onClick={() => navigate('/course/new')}
        aria-label="코스 업로드"
        className="absolute right-4 bottom-4 w-12 h-12 bg-black text-white rounded-full flex items-center justify-center shadow-lg active:bg-neutral-800"
      >
        <Plus size={22} />
      </button>
    </div>
  );
});
