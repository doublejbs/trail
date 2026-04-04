import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus, User, Activity, ArrowRight, Ruler, Mountain } from 'lucide-react';
import { GroupStore } from '../stores/GroupStore';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

function useSignedUrl(group: Group, elRef: React.RefObject<HTMLElement | null>) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!group.thumbnail_path) return;
    const el = elRef.current;
    if (!el) return;

    const bucket = group.thumbnail_path.endsWith('_thumb.png') && group.gpx_bucket === 'gpx-files'
      ? 'gpx-files'
      : 'course-gpx';

    const obs = new IntersectionObserver(
      async ([entry], o) => {
        if (!entry?.isIntersecting) return;
        o.disconnect();
        try {
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(group.thumbnail_path!, 3600);
          if (!error && data?.signedUrl) setUrl(data.signedUrl);
        } catch { /* ignore */ }
      },
      { rootMargin: '200px', threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [group.thumbnail_path, group.gpx_bucket]);

  return url;
}

/** 트래킹 중 가로 스크롤 카드 */
function ActiveCard({ group, onClick }: { group: Group; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const url = useSignedUrl(group, ref);

  return (
    <button
      ref={ref}
      onClick={onClick}
      className="snap-center shrink-0 w-[80vw] max-w-[360px] bg-black rounded-2xl p-3.5 flex items-center gap-3.5 text-left active:scale-[0.97] transition-transform"
    >
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/10 shrink-0">
        {url ? (
          <img src={url} alt={group.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Activity size={18} className="text-white/30" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="inline-block px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold text-white/70 tracking-wider uppercase mb-1">
          트래킹 중
        </span>
        <p className="text-[15px] font-bold text-white truncate">{group.name}</p>
      </div>
    </button>
  );
}

function getGroupStatus(group: Group): { label: string; active: boolean } {
  const now = Date.now();
  if (group.period_started_at && group.period_ended_at) {
    const end = new Date(group.period_ended_at).getTime();
    if (now > end) return { label: '종료', active: false };
  }
  if (group.period_started_at) {
    const start = new Date(group.period_started_at).getTime();
    if (now >= start) return { label: '진행 중', active: true };
  }
  return { label: '진행 중', active: true };
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatElevation(m: number): string {
  return `${Math.round(m)} m`;
}

/** 멤버 아바타 스택 */
function MemberAvatars({ group }: { group: Group }) {
  const members = group.members ?? [];
  const extra = (group.member_count ?? 0) - members.length;

  if (members.length === 0 && (group.member_count ?? 0) === 0) return null;

  return (
    <div className="flex -space-x-1.5">
      {members.map((m) => (
        <div key={m.user_id} className="w-7 h-7 rounded-full border-2 border-white bg-black/[0.06] overflow-hidden">
          {m.avatar_url ? (
            <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User size={11} className="text-black/30" />
            </div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-7 h-7 rounded-full border-2 border-white bg-black/[0.06] flex items-center justify-center">
          <span className="text-[9px] font-bold text-black/40">+{extra}</span>
        </div>
      )}
    </div>
  );
}

/** 메인 리스트 카드 */
function GroupCard({ group, onClick }: { group: Group; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const url = useSignedUrl(group, ref);
  const status = getGroupStatus(group);

  return (
    <button
      ref={ref}
      onClick={onClick}
      className="w-full bg-white border border-black/[0.06] rounded-2xl p-4 flex flex-col gap-3 text-left active:bg-black/[0.02] transition-colors"
    >
      <div className="h-44 rounded-xl overflow-hidden bg-black/[0.04] relative">
        {url ? (
          <img src={url} alt={group.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 18L8 10L12 14L16 6L20 12" stroke="black" strokeOpacity="0.12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
        <div className={`absolute top-2.5 left-2.5 px-2.5 h-6 rounded-full backdrop-blur-md flex items-center ${
          status.active
            ? 'bg-black/60 text-white'
            : 'bg-white/70 text-black/50'
        }`}>
          <span className="text-[10px] font-bold tracking-wider uppercase leading-none">{status.label}</span>
        </div>
      </div>
      <div>
        <h3 className="text-[17px] font-bold text-black">{group.name}</h3>
        {/* 거리 · 고도 · 난이도 */}
        <div className="flex items-center gap-3 mt-1.5">
          {group.distance_m != null && (
            <div className="flex items-center gap-1">
              <Ruler size={14} className="text-black/30" />
              <span className="text-[13px] font-medium text-black/50">{formatDistance(group.distance_m)}</span>
            </div>
          )}
          {group.elevation_gain_m != null && (
            <div className="flex items-center gap-1">
              <Mountain size={14} className="text-black/30" />
              <span className="text-[13px] font-medium text-black/50">{formatElevation(group.elevation_gain_m)}</span>
            </div>
          )}
          {group.difficulty && (
            <span className="text-[11px] font-bold text-black/30 uppercase">{group.difficulty}</span>
          )}
        </div>
        {/* 멤버 아바타 + 보기 링크 */}
        <div className="flex items-center justify-between mt-3.5">
          <MemberAvatars group={group} />
          <span className="text-[12px] font-bold text-black/40 flex items-center gap-1">
            경로 보기 <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </button>
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

  const allVisible = store.onlyOwned
    ? store.groups.filter((g) => g.created_by === store.currentUserId)
    : store.groups;
  const activeIds = new Set(store.activeTrackingGroupIds);
  const activeGroups = allVisible.filter((g) => activeIds.has(g.id));
  const visibleGroups = allVisible.filter((g) => !activeIds.has(g.id));
  const emptyMessage = store.onlyOwned
    ? '아직 만든 그룹이 없습니다'
    : '아직 그룹이 없습니다';

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-end justify-between px-5 pb-4" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
          <h1 className="text-[26px] font-extrabold tracking-tight text-black">그룹</h1>
          <button
            onClick={() => navigate('/profile')}
            aria-label="프로필"
            className="flex items-center justify-center active:opacity-50 transition-opacity mb-0.5"
          >
            <User size={24} strokeWidth={2} className="text-black" />
          </button>
        </div>

        {/* 트래킹 중 — 가로 스크롤 */}
        {activeGroups.length > 0 && (
          <section className="mb-5">
            <p className="text-[13px] font-bold text-black/40 px-5 mb-2.5">트래킹 중</p>
            <div className="flex overflow-x-auto hide-scrollbar snap-x snap-mandatory px-5 gap-3">
              {activeGroups.map((g) => (
                <ActiveCard
                  key={g.id}
                  group={g}
                  onClick={() => navigate(`/group/${g.id}`)}
                />
              ))}
              <div className="shrink-0 w-2" />
            </div>
          </section>
        )}

        {/* Filter chips */}
        <div className="flex overflow-x-auto hide-scrollbar gap-1.5 px-5 pb-1.5">
          <button
            onClick={() => { if (store.onlyOwned) store.toggleOnlyOwned(); }}
            aria-pressed={!store.onlyOwned}
            className={`shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold min-h-0 min-w-0 transition-colors ${
              !store.onlyOwned
                ? 'bg-black text-white'
                : 'bg-black/[0.05] text-black/45'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => { if (!store.onlyOwned) store.toggleOnlyOwned(); }}
            aria-pressed={store.onlyOwned}
            className={`shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold min-h-0 min-w-0 transition-colors ${
              store.onlyOwned
                ? 'bg-black text-white'
                : 'bg-black/[0.05] text-black/45'
            }`}
          >
            내가 만든
          </button>
        </div>

        {/* Group card list */}
        {visibleGroups.length === 0 && activeGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-black/[0.04] flex items-center justify-center">
              <Plus size={20} className="text-black/20" />
            </div>
            <p className="text-[13px] text-black/35">{emptyMessage}</p>
          </div>
        ) : (
          <div className="px-5 flex flex-col gap-4 pb-4">
            {visibleGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onClick={() => navigate(`/group/${group.id}`)}
              />
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
