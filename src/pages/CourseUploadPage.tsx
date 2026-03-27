// src/pages/CourseUploadPage.tsx
import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { CourseUploadStore } from '../stores/CourseUploadStore';
import { MapStore } from '../stores/MapStore';
import { NavigationBar } from '../components/NavigationBar';

const DIFFICULTY_TAGS = ['쉬움', '보통', '어려움'];
const TERRAIN_TAGS = ['산악', '도심', '해안', '평지'];

export const CourseUploadPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new CourseUploadStore());
  const [mapStore] = useState(() => new MapStore());
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [gpxText, setGpxText] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    mapStore.initMap(mapRef.current);
    setMapReady(true);
    return () => mapStore.destroy();
  }, [mapStore]);

  useEffect(() => {
    if (mapReady && gpxText) {
      mapStore.drawGpxRoute(gpxText);
    }
  }, [mapStore, mapReady, gpxText]);

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

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
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
            <p className="text-[12px] text-red-500 -mt-3">{store.gpxError}</p>
          )}

          {/* Name */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-semibold text-black/50">
              코스 이름 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={store.name}
              onChange={(e) => store.setName(e.target.value)}
              placeholder="코스 이름을 입력하세요"
              className="bg-black/[0.03] rounded-xl px-4 py-3 text-[15px] border border-black/[0.06] outline-none focus:border-black/20 transition-colors placeholder:text-black/25"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-semibold text-black/50">설명</label>
            <textarea
              value={store.description}
              onChange={(e) => store.setDescription(e.target.value)}
              placeholder="코스 설명을 입력하세요 (선택)"
              rows={3}
              className="bg-black/[0.03] rounded-xl px-4 py-3 text-[15px] border border-black/[0.06] outline-none focus:border-black/20 transition-colors resize-none placeholder:text-black/25"
            />
          </div>

          {/* Difficulty tags */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-semibold text-black/50">난이도</label>
            <div className="flex gap-2">
              {DIFFICULTY_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => store.tags.includes(tag) ? store.removeTag(tag) : store.addTag(tag)}
                  className={`px-4 py-2 rounded-full text-[13px] font-semibold transition-all ${
                    store.tags.includes(tag)
                      ? 'bg-black text-white'
                      : 'bg-black/[0.04] text-black/40'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Terrain tags */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-semibold text-black/50">지형</label>
            <div className="flex gap-2 flex-wrap">
              {TERRAIN_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => store.tags.includes(tag) ? store.removeTag(tag) : store.addTag(tag)}
                  className={`px-4 py-2 rounded-full text-[13px] font-semibold transition-all ${
                    store.tags.includes(tag)
                      ? 'bg-black text-white'
                      : 'bg-black/[0.04] text-black/40'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Public toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-[14px] font-medium text-black/80">공개 코스</p>
              <p className="text-[12px] text-black/35">공개하면 다른 사용자도 이 코스를 볼 수 있습니다</p>
            </div>
            <button
              type="button"
              onClick={() => store.setIsPublic(!store.isPublic)}
              className={`relative w-[46px] h-[26px] rounded-full transition-colors ${store.isPublic ? 'bg-black' : 'bg-black/15'}`}
              aria-label="공개 여부 토글"
            >
              <span
                className={`absolute top-[3px] w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${store.isPublic ? 'translate-x-[23px]' : 'translate-x-[3px]'}`}
              />
            </button>
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
