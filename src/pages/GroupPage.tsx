import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus, ChevronRight } from 'lucide-react';
import { GroupStore } from '../stores/GroupStore';
import { LargeTitle } from '../components/LargeTitle';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

function GroupThumbnail({ group }: { group: Group }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!group.thumbnail_path) return;
    const el = ref.current;
    if (!el) return;

    const bucket = group.thumbnail_path.endsWith('_thumb.png') && group.gpx_bucket === 'gpx-files'
      ? 'gpx-files'
      : 'course-gpx';

    const observer = new IntersectionObserver(
      async ([entry], obs) => {
        if (!entry?.isIntersecting) return;
        obs.disconnect();
        try {
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(group.thumbnail_path!, 3600);
          if (!error && data?.signedUrl) setUrl(data.signedUrl);
        } catch { /* ignore */ }
      },
      { rootMargin: '200px', threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [group.thumbnail_path, group.gpx_bucket]);

  return (
    <div
      ref={ref}
      className="w-12 h-12 rounded-xl overflow-hidden bg-black/[0.04] flex items-center justify-center shrink-0"
    >
      {url ? (
        <img src={url} alt={group.name} className="w-full h-full object-cover" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 18L8 10L12 14L16 6L20 12" stroke="black" strokeOpacity="0.25" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

export const GroupPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupStore());

  useEffect(() => {
    store.load();
  }, [store]);

  if (store.loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (store.error) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <p className="text-[13px] text-black/35">그룹을 불러올 수 없습니다</p>
      </div>
    );
  }

  const ownedGroups = store.groups.filter(
    (g) => g.created_by === store.currentUserId
  );
  const joinedGroups = store.groups.filter(
    (g) => g.created_by !== store.currentUserId
  );
  const visibleGroups = store.activeTab === 'owned' ? ownedGroups : joinedGroups;
  const emptyMessage =
    store.activeTab === 'owned'
      ? '아직 만든 그룹이 없습니다'
      : '아직 참여한 그룹이 없습니다';

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-1 overflow-y-auto">
        <LargeTitle title="그룹" />

        {/* Segmented control */}
        <div className="flex gap-1.5 px-5 pb-1.5">
          <button
            onClick={() => store.setActiveTab('owned')}
            aria-pressed={store.activeTab === 'owned'}
            className={`px-4 py-1.5 rounded-full text-[13px] font-semibold min-h-0 min-w-0 transition-colors ${
              store.activeTab === 'owned'
                ? 'bg-black text-white'
                : 'bg-black/[0.05] text-black/45'
            }`}
          >
            내가 만든
          </button>
          <button
            onClick={() => store.setActiveTab('joined')}
            aria-pressed={store.activeTab === 'joined'}
            className={`px-4 py-1.5 rounded-full text-[13px] font-semibold min-h-0 min-w-0 transition-colors ${
              store.activeTab === 'joined'
                ? 'bg-black text-white'
                : 'bg-black/[0.05] text-black/45'
            }`}
          >
            참여중
          </button>
        </div>

        {/* Group list */}
        {visibleGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-black/[0.04] flex items-center justify-center">
              <Plus size={20} className="text-black/20" />
            </div>
            <p className="text-[13px] text-black/35">{emptyMessage}</p>
          </div>
        ) : (
          <div className="px-5 flex flex-col gap-2">
            {visibleGroups.map((group) => (
              <button
                key={group.id}
                onClick={() => navigate(`/group/${group.id}`)}
                className="w-full flex items-center justify-between bg-white border border-black/[0.06] rounded-2xl px-4 py-3 text-left active:bg-black/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <GroupThumbnail group={group} />
                  <span className="text-[15px] font-semibold text-black truncate">{group.name}</span>
                </div>
                <ChevronRight size={18} className="text-black/20 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <div className="absolute right-5 bottom-24">
        <button
          onClick={() => navigate('/group/new')}
          aria-label="그룹 만들기"
          className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center shadow-lg shadow-black/20 active:scale-95 transition-transform"
        >
          <Plus size={24} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
});
