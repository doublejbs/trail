// src/pages/CourseUploadPage.tsx
import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { CourseUploadStore } from '../stores/CourseUploadStore';
import { MapStore } from '../stores/MapStore';
import { MapRenderingStore } from '../stores/MapRenderingStore';
import { NavigationBar } from '../components/NavigationBar';

const DIFFICULTY_TAGS = ['쉬움', '보통', '어려움'];
const TERRAIN_TAGS = ['산악', '도심', '해안', '평지'];

export const CourseUploadPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new CourseUploadStore());
  const [mapStore] = useState(() => new MapStore());
  const [renderingStore] = useState(() => new MapRenderingStore(() => mapStore.map));
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [gpxText, setGpxText] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    mapStore.initMap(mapRef.current);
    setMapReady(true);
    return () => { renderingStore.destroy(); mapStore.destroy(); };
  }, [mapStore, renderingStore]);

  useEffect(() => {
    if (mapReady && gpxText) {
      renderingStore.drawGpxRoute(gpxText);
    }
  }, [renderingStore, mapReady, gpxText]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    const text = await f.text();
    await store.setFile(f);
    if (!store.gpxError) setGpxText(text);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const courseId = await store.submit();
    if (courseId) {
      navigate('/course');
    } else {
      toast.error(store.error ?? '오류가 발생했습니다');
    }
  };

  return (
    <div className="h-full bg-white flex flex-col">
      <NavigationBar title="코스 업로드" onBack={() => navigate('/course')} />

      <div className="flex-1 overflow-y-auto">
        {/* Map preview */}
        <div
          ref={mapRef}
          data-testid="map-container"
          className="w-full bg-[#f3f3f0]"
          style={{ height: 200 }}
        />

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          {/* GPX file */}
          <label className="flex flex-col items-center justify-center bg-black/[0.02] rounded-2xl px-4 py-6 border border-dashed border-black/10 cursor-pointer hover:border-black/20 transition-colors">
            <Upload size={20} className="text-black/25 mb-2" />
            <span className="text-[13px] font-semibold text-black/50">
              {store.file ? store.file.name : 'GPX 파일을 선택하세요'}
            </span>
            {!store.file && (
              <span className="text-[11px] text-black/25 mt-1">.gpx 파일만 지원됩니다</span>
            )}
            <input type="file" accept=".gpx" className="hidden" onChange={handleFileChange} />
          </label>
          {store.gpxError && (
            <p className="text-[12px] text-red-500 -mt-2">{store.gpxError}</p>
          )}

          {/* Main fields card */}
          <div className="rounded-2xl border border-black/[0.06] overflow-hidden">
            {/* Name */}
            <div className="px-4 py-3.5 border-b border-black/[0.06]">
              <label className="text-[11px] font-semibold text-black/35 uppercase tracking-wide">
                코스 이름 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={store.name}
                onChange={(e) => store.setName(e.target.value)}
                placeholder="코스 이름을 입력하세요"
                className="w-full mt-1 bg-transparent text-[15px] outline-none placeholder:text-black/20"
              />
            </div>

            {/* Region */}
            <div className="px-4 py-3.5 border-b border-black/[0.06]">
              <label className="text-[11px] font-semibold text-black/35 uppercase tracking-wide">위치</label>
              <input
                type="text"
                value={store.region}
                onChange={(e) => store.setRegion(e.target.value)}
                placeholder="GPX 업로드 시 자동 입력"
                className="w-full mt-1 bg-transparent text-[15px] outline-none placeholder:text-black/20"
              />
            </div>

            {/* Description */}
            <div className="px-4 py-3.5 border-b border-black/[0.06]">
              <label className="text-[11px] font-semibold text-black/35 uppercase tracking-wide">설명</label>
              <textarea
                value={store.description}
                onChange={(e) => store.setDescription(e.target.value)}
                placeholder="코스 설명을 입력하세요 (선택)"
                rows={2}
                className="w-full mt-1 bg-transparent text-[15px] outline-none resize-none placeholder:text-black/20"
              />
            </div>

            {/* Tags */}
            <div className="px-4 py-3.5 border-b border-black/[0.06]">
              <label className="text-[11px] font-semibold text-black/35 uppercase tracking-wide block mb-2.5">태그</label>
              <div className="flex gap-2 flex-wrap">
                {[...DIFFICULTY_TAGS, ...TERRAIN_TAGS].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => store.tags.includes(tag) ? store.removeTag(tag) : store.addTag(tag)}
                    className={`px-2.5 py-[3px] rounded-full text-[12px] font-medium transition-all ${
                      store.tags.includes(tag)
                        ? 'bg-black text-white'
                        : 'bg-black/[0.05] text-black/35'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Public toggle */}
            <div className="px-4 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-[15px] font-medium text-black/80">공개 코스</p>
                <p className="text-[12px] text-black/35 mt-0.5">다른 사용자도 이 코스를 볼 수 있습니다</p>
              </div>
              {/* 래퍼 div로 크기 고정 — button이 flex에서 늘어나는 문제 방지 */}
              <div style={{ width: 46, height: 26, flexShrink: 0, position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => store.setIsPublic(!store.isPublic)}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 13,
                    backgroundColor: store.isPublic ? '#000000' : 'rgba(0,0,0,0.15)',
                    transition: 'background-color 0.2s',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  aria-label="공개 여부 토글"
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: 3,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      backgroundColor: 'white',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transform: store.isPublic ? 'translateX(20px)' : 'translateX(0)',
                      transition: 'transform 0.2s',
                      display: 'block',
                    }}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={!store.isValid || store.submitting}
              className="w-full py-3.5 rounded-xl bg-black text-white font-semibold text-[15px] disabled:opacity-30 flex items-center justify-center gap-2 active:bg-black/80 transition-colors"
            >
              {store.submitting && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              업로드
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});
