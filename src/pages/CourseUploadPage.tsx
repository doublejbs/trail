// src/pages/CourseUploadPage.tsx
import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { CourseUploadStore } from '../stores/CourseUploadStore';
import { MapStore } from '../stores/MapStore';

const DIFFICULTY_TAGS = ['쉬움', '보통', '어려움'];
const TERRAIN_TAGS = ['산악', '도심', '해안', '평지'];

export const CourseUploadPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new CourseUploadStore());
  const [mapStore] = useState(() => new MapStore());
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [gpxText, setGpxText] = useState<string | null>(null);

  // Init map once
  useEffect(() => {
    if (!mapRef.current) return;
    mapStore.initMap(mapRef.current);
    setMapReady(true);
    return () => mapStore.destroy();
  }, [mapStore]);

  // Draw route when GPX parsed and map ready
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
      {/* Header */}
      <div className="flex items-center px-2 py-2 border-b border-neutral-200">
        <button
          onClick={() => navigate('/course')}
          className="flex items-center justify-center w-11 h-11 rounded-full text-black active:bg-neutral-100 transition-colors"
          aria-label="뒤로"
        >
          <svg width="11" height="19" viewBox="0 0 11 19" fill="none" aria-hidden="true">
            <path d="M9.5 1.5L1.5 9.5L9.5 17.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="flex-1 text-center text-base font-semibold">코스 업로드</h1>
        <div className="w-11" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Map preview */}
        <div
          ref={mapRef}
          data-testid="map-container"
          className="w-full bg-neutral-100"
          style={{ height: 200 }}
        />

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
          {/* GPX file */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-500">GPX 파일</label>
            <label className="bg-neutral-100 rounded-lg px-3 py-2 text-sm border border-neutral-200 cursor-pointer flex items-center">
              <span className="text-neutral-500">
                {store.file ? store.file.name : '파일 선택'}
              </span>
              <input type="file" accept=".gpx" className="hidden" onChange={handleFileChange} />
            </label>
            {store.gpxError && (
              <p className="text-xs text-red-500">{store.gpxError}</p>
            )}
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-500">코스 이름 <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={store.name}
              onChange={(e) => store.setName(e.target.value)}
              placeholder="코스 이름을 입력하세요"
              className="bg-neutral-100 rounded-lg px-3 py-2 text-sm border border-neutral-200 outline-none focus:border-black"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-500">설명</label>
            <textarea
              value={store.description}
              onChange={(e) => store.setDescription(e.target.value)}
              placeholder="코스 설명을 입력하세요 (선택)"
              rows={3}
              className="bg-neutral-100 rounded-lg px-3 py-2 text-sm border border-neutral-200 outline-none focus:border-black resize-none"
            />
          </div>

          {/* Difficulty tags */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-neutral-500">난이도</label>
            <div className="flex gap-2">
              {DIFFICULTY_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => store.tags.includes(tag) ? store.removeTag(tag) : store.addTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    store.tags.includes(tag)
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-neutral-600 border-neutral-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Terrain tags */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-neutral-500">지형</label>
            <div className="flex gap-2 flex-wrap">
              {TERRAIN_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => store.tags.includes(tag) ? store.removeTag(tag) : store.addTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    store.tags.includes(tag)
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-neutral-600 border-neutral-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={!store.isValid || store.submitting}
              className="w-full py-3 rounded-xl bg-black text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {store.submitting && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              업로드
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});
