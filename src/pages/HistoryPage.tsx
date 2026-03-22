import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { HistoryStore } from '../stores/HistoryStore';
import type { HistorySession } from '../stores/HistoryStore';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

function SessionCard({ session, onClick }: { session: HistorySession; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-4 border-b border-neutral-100 active:bg-neutral-50"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-black truncate">{session.groupName}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{formatDate(session.createdAt)}</p>
        </div>
        <span className="text-xs text-neutral-400 ml-2 shrink-0">
          {formatDistance(session.maxRouteMeters)} 진행
        </span>
      </div>
      <div className="flex gap-4 mt-2">
        <div>
          <p className="text-base font-semibold tabular-nums">{formatTime(session.elapsedSeconds)}</p>
          <p className="text-xs text-neutral-400">시간</p>
        </div>
        <div>
          <p className="text-base font-semibold tabular-nums">{formatDistance(session.distanceMeters)}</p>
          <p className="text-xs text-neutral-400">이동거리</p>
        </div>
        <div>
          <p className="text-base font-semibold tabular-nums">{formatDistance(session.maxRouteMeters)}</p>
          <p className="text-xs text-neutral-400">코스 진행</p>
        </div>
      </div>
    </button>
  );
}

export const HistoryPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new HistoryStore());

  useEffect(() => {
    void store.load();
  }, [store]);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center px-4 py-3 border-b border-neutral-100">
        <h1 className="text-base font-semibold">기록</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {store.loading && (
          <div className="flex justify-center pt-16">
            <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!store.loading && store.error && (
          <p className="text-xs text-red-500 text-center pt-8">{store.error}</p>
        )}

        {!store.loading && !store.error && store.sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-16 gap-2">
            <p className="text-sm text-neutral-400">아직 기록이 없습니다</p>
            <p className="text-xs text-neutral-300">등산 후 트래킹을 종료하면 기록이 저장됩니다</p>
          </div>
        )}

        {store.sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onClick={() => navigate(`/group/${session.groupId}`)}
          />
        ))}
      </div>
    </div>
  );
});
