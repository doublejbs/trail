import { useEffect, useRef, useState } from 'react';
import { User, ArrowRight, Ruler, Mountain } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

export const useSignedUrl = (group: Group, elRef: React.RefObject<HTMLElement | null>) => {
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
};

const getGroupStatus = (group: Group): { label: string; active: boolean } => {
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
};

const formatDistance = (m: number): string => {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
};

const formatElevation = (m: number): string => {
  return `${Math.round(m)} m`;
};

const MemberAvatarsSkeleton = ({ count }: { count: number }) => {
  const n = Math.min(count, 3);
  return (
    <div className="flex -space-x-1.5">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="w-7 h-7 rounded-full border-2 border-white bg-black/[0.06] animate-pulse" />
      ))}
      {count > 3 && (
        <div className="w-7 h-7 rounded-full border-2 border-white bg-black/[0.06] animate-pulse" />
      )}
    </div>
  );
};

const MemberAvatars = ({ group, loading }: { group: Group; loading?: boolean }) => {
  const memberCount = group.member_count ?? 0;
  const members = group.members ?? [];

  if (memberCount === 0) return null;

  if (loading && members.length === 0) {
    return <MemberAvatarsSkeleton count={memberCount} />;
  }

  const extra = memberCount - members.length;

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
};

export const GroupCard = ({ group, onClick, membersLoading }: { group: Group; onClick: () => void; membersLoading?: boolean }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const url = useSignedUrl(group, ref);
  const [imgLoaded, setImgLoaded] = useState(false);
  const status = getGroupStatus(group);

  const showSpinner = group.thumbnail_path && !imgLoaded;

  return (
    <button
      ref={ref}
      onClick={onClick}
      className="w-full bg-white border border-black/[0.06] rounded-2xl p-4 flex flex-col gap-3 text-left active:bg-black/[0.02] transition-colors"
    >
      <div className="h-44 rounded-xl overflow-hidden bg-black/[0.04] relative">
        {url && (
          <img
            src={url}
            alt={group.name}
            onLoad={() => setImgLoaded(true)}
            className={`w-full h-full object-cover transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
        {showSpinner && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-black/15 border-t-black/40 rounded-full animate-spin" />
          </div>
        )}
        {!group.thumbnail_path && (
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
        <div className="flex items-center justify-between mt-3.5">
          <MemberAvatars group={group} loading={membersLoading} />
          <span className="text-[12px] font-bold text-black/40 flex items-center gap-1">
            경로 보기 <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </button>
  );
};
