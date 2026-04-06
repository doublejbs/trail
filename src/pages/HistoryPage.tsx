import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Clock, MapPin, Route } from 'lucide-react';
import { HistoryStore } from '../stores/HistoryStore';
import type { HistorySession } from '../stores/HistoryStore';
import { LargeTitle } from '../components/LargeTitle';

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
};

const formatDistance = (meters: number): string => {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
};

const SessionCard = ({ session, onClick }: { session: HistorySession; onClick: () => void }) => {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-black/[0.06] rounded-2xl px-4 py-4 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-black truncate">{session.groupName}</p>
          <p className="text-[12px] text-black/30 mt-0.5 font-medium">{formatDate(session.createdAt)}</p>
        </div>
        <span className="text-[12px] text-black/35 ml-2 shrink-0 bg-black/[0.04] rounded-full px-2.5 py-1 font-semibold">
          {formatDistance(session.maxRouteMeters)}
        </span>
      </div>
      <div className="flex gap-5">
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="text-black/25" />
          <div>
            <p className="text-[15px] font-bold tabular-nums text-black">{formatTime(session.elapsedSeconds)}</p>
            <p className="text-[10px] text-black/30 font-medium">시간</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin size={13} className="text-black/25" />
          <div>
            <p className="text-[15px] font-bold tabular-nums text-black">{formatDistance(session.distanceMeters)}</p>
            <p className="text-[10px] text-black/30 font-medium">이동거리</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Route size={13} className="text-black/25" />
          <div>
            <p className="text-[15px] font-bold tabular-nums text-black">{formatDistance(session.maxRouteMeters)}</p>
            <p className="text-[10px] text-black/30 font-medium">코스 진행</p>
          </div>
        </div>
      </div>
    </button>
  );
};

export const HistoryPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new HistoryStore());

  useEffect(() => {
    void store.load();
  }, [store]);

  return (
    <div className="flex flex-col h-full bg-white">
      <LargeTitle title="기록" />

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {store.loading && (
          <div className="flex justify-center pt-16">
            <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
          </div>
        )}

        {!store.loading && store.error && (
          <p className="text-[12px] text-red-500 text-center pt-8">{store.error}</p>
        )}

        {!store.loading && !store.error && store.sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-black/[0.04] flex items-center justify-center">
              <Clock size={20} className="text-black/20" />
            </div>
            <p className="text-[13px] text-black/35">아직 기록이 없습니다</p>
            <p className="text-[12px] text-black/20">등산 후 트래킹을 종료하면 기록이 저장됩니다</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {store.sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onClick={() => navigate(`/group/${session.groupId}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
