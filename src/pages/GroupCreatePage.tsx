import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { MapPin, TrendingUp, Check, Search } from 'lucide-react';
import { NavigationBar } from '../components/NavigationBar';
import { GroupCreateStore } from '../stores/GroupCreateStore';
import { MapStore } from '../stores/MapStore';
import { MapRenderingStore } from '../stores/MapRenderingStore';
import { CourseThumbnail } from '../components/CourseThumbnail';

export const GroupCreatePage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupCreateStore(navigate));
  const [mapStore] = useState(() => new MapStore());
  const [renderingStore] = useState(() => new MapRenderingStore(() => mapStore.map));
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [gpxText, setGpxText] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    store.submit();
  };

  // Init map when switching to file mode
  useEffect(() => {
    if (store.sourceMode !== 'file' || !mapRef.current) return;
    mapStore.initMap(mapRef.current);
    setMapReady(true);
    return () => { renderingStore.destroy(); mapStore.destroy(); setMapReady(false); };
  }, [mapStore, renderingStore, store.sourceMode]);

  // Draw route when GPX is loaded
  useEffect(() => {
    if (mapReady && gpxText) {
      renderingStore.drawGpxRoute(gpxText);
    }
  }, [renderingStore, mapReady, gpxText]);

const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    store.setFile(f);
    const text = await f.text();
    setGpxText(text);
  };

  return (
    <div className="h-full bg-white flex flex-col">
      <NavigationBar title="그룹 만들기" onBack={() => navigate('/group')} />

      {/* Fixed top: name + tabs */}
      <div className="shrink-0 flex flex-col gap-4 p-5 pb-3">
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-black/50">그룹명</label>
          <input
            type="text"
            value={store.name}
            onChange={(e) => store.setName(e.target.value)}
            className="bg-black/[0.03] text-black rounded-xl px-4 py-3 text-[15px] outline-none border border-black/[0.06] focus:border-black/20 transition-colors placeholder:text-black/25"
            placeholder="그룹명을 입력하세요"
          />
        </div>

        <div className="flex rounded-xl bg-black/[0.04] p-1">
          <button
            type="button"
            onClick={() => store.setSourceMode('course')}
            className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${
              store.sourceMode === 'course'
                ? 'bg-black text-white shadow-sm'
                : 'text-black/40'
            }`}
          >
            코스 선택
          </button>
          <button
            type="button"
            onClick={() => store.setSourceMode('file')}
            className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${
              store.sourceMode === 'file'
                ? 'bg-black text-white shadow-sm'
                : 'text-black/40'
            }`}
          >
            GPX 업로드
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pb-3">
        {store.sourceMode === 'course' ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 bg-black/[0.04] rounded-xl px-3 py-2.5">
              <Search size={15} className="text-black/30 shrink-0" />
              <input
                type="text"
                value={store.courseQuery}
                onChange={(e) => store.setCourseQuery(e.target.value)}
                placeholder="코스 검색"
                className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-black/30"
              />
            </div>
            {store.coursesLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
              </div>
            ) : store.filteredCourses.length === 0 ? (
              <p className="text-[13px] text-black/30 text-center py-8">
                {store.courseQuery.trim() ? '검색 결과가 없습니다' : '등록된 코스가 없습니다'}
              </p>
            ) : (
              store.filteredCourses.map((course) => {
                const selected = store.selectedCourseId === course.id;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => store.setSelectedCourseId(course.id)}
                    className={`flex items-center gap-3 text-left rounded-xl px-3 py-3 border transition-all ${
                      selected
                        ? 'border-black bg-black/[0.03]'
                        : 'border-black/[0.06] bg-white'
                    }`}
                  >
                    <CourseThumbnail course={course} size={44} className="rounded-lg" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-bold text-black truncate">{course.name}</div>
                      <div className="flex items-center gap-2.5 mt-0.5">
                        <span className="flex items-center gap-1 text-[11px] text-black/35 font-medium">
                          <MapPin size={10} strokeWidth={2.5} />
                          {course.distance_m != null
                            ? `${(course.distance_m / 1000).toFixed(1)} km`
                            : '—'}
                        </span>
                        {course.elevation_gain_m != null && (
                          <span className="flex items-center gap-1 text-[11px] text-black/35 font-medium">
                            <TrendingUp size={10} strokeWidth={2.5} />
                            {course.elevation_gain_m} m
                          </span>
                        )}
                      </div>
                    </div>
                    {selected && (
                      <div className="shrink-0 w-6 h-6 rounded-full bg-black flex items-center justify-center">
                        <Check size={14} strokeWidth={2.5} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Map preview */}
            <div
              ref={mapRef}
              className="w-full rounded-2xl overflow-hidden bg-[#f3f3f0]"
              style={{ height: gpxText ? '42vh' : 0, transition: 'height 0.3s ease' }}
            />

            {/* File picker */}
            <label className="flex items-center justify-center bg-black/[0.03] rounded-xl px-4 py-6 border border-dashed border-black/10 cursor-pointer hover:border-black/20 transition-colors">
              <div className="text-center">
                <p className="text-[13px] font-semibold text-black/50">
                  {store.file ? store.file.name : 'GPX 파일을 선택하세요'}
                </p>
                {!store.file && (
                  <p className="text-[11px] text-black/25 mt-1">.gpx 파일만 지원됩니다</p>
                )}
              </div>
              <input
                type="file"
                accept=".gpx"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        )}
      </div>

      {/* Fixed bottom button */}
      <div className="shrink-0 p-5 pt-3 border-t border-black/[0.04] bg-white">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!store.isValid || store.submitting}
          className="w-full py-3.5 rounded-xl bg-black text-white font-semibold text-[15px] disabled:opacity-30 flex items-center justify-center gap-2 active:bg-black/80 transition-colors"
        >
          {store.submitting && (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          그룹 만들기
        </button>
      </div>
    </div>
  );
});
