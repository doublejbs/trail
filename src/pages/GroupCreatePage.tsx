import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { GroupCreateStore } from '../stores/GroupCreateStore';

export const GroupCreatePage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupCreateStore(navigate));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    store.submit();
  };

  return (
    <div className="h-full bg-white text-black flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-2 py-2 border-b border-neutral-200">
        <button
          onClick={() => navigate('/group')}
          className="flex items-center justify-center w-11 h-11 rounded-full text-black active:bg-neutral-100 transition-colors"
          aria-label="뒤로"
        >
          <svg width="11" height="19" viewBox="0 0 11 19" fill="none" aria-hidden="true">
            <path d="M9.5 1.5L1.5 9.5L9.5 17.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="flex-1 text-center text-base font-semibold">그룹 만들기</h1>
        <div className="w-11" />
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-500">그룹명</label>
            <input
              type="text"
              value={store.name}
              onChange={(e) => store.setName(e.target.value)}
              className="bg-neutral-100 text-black rounded-lg px-3 py-2 text-sm outline-none border border-neutral-200 focus:border-black"
              placeholder="그룹명을 입력하세요"
            />
          </div>

          {/* 탭 */}
          <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
            <button
              type="button"
              onClick={() => store.setSourceMode('course')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                store.sourceMode === 'course'
                  ? 'bg-black text-white'
                  : 'text-neutral-500 bg-white'
              }`}
            >
              코스 선택
            </button>
            <button
              type="button"
              onClick={() => store.setSourceMode('file')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                store.sourceMode === 'file'
                  ? 'bg-black text-white'
                  : 'text-neutral-500 bg-white'
              }`}
            >
              GPX 업로드
            </button>
          </div>

          {/* 탭 콘텐츠 */}
          {store.sourceMode === 'course' ? (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {store.coursesLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                </div>
              ) : store.courses.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-6">등록된 코스가 없습니다</p>
              ) : (
                store.courses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => store.setSelectedCourseId(course.id)}
                    className={`text-left rounded-lg px-3 py-2 border transition-colors ${
                      store.selectedCourseId === course.id
                        ? 'border-black bg-neutral-50'
                        : 'border-neutral-200 bg-white'
                    }`}
                  >
                    <div className="text-sm font-medium">{course.name}</div>
                    <div className="text-xs text-neutral-400 mt-0.5">
                      {course.distance_m != null
                        ? `${(course.distance_m / 1000).toFixed(1)} km`
                        : '거리 미상'}
                      {course.elevation_gain_m != null
                        ? ` · 고도 ${course.elevation_gain_m} m`
                        : ''}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="bg-neutral-100 rounded-lg px-3 py-2 text-sm border border-neutral-200 cursor-pointer flex items-center">
                <span className="text-neutral-500">
                  {store.file ? store.file.name : '파일 선택'}
                </span>
                <input
                  type="file"
                  accept=".gpx"
                  className="hidden"
                  onChange={(e) => store.setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4">
          <button
            type="submit"
            disabled={!store.isValid || store.submitting}
            className="w-full py-2 rounded-lg bg-black text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {store.submitting && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            그룹 만들기
          </button>
        </div>
      </form>
    </div>
  );
});
