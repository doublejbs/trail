import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus, User } from 'lucide-react';
import { GroupStore, type GroupFilter } from '../stores/GroupStore';
import { GroupCard } from '../components/GroupCard';
import type { Group } from '../types/group';

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

  const now = Date.now();
  const isEnded = (g: Group) =>
    g.period_ended_at && new Date(g.period_ended_at).getTime() < now;
  const isActive = (g: Group) => !isEnded(g);

  let visibleGroups = store.groups;
  if (store.filter === 'active') visibleGroups = store.groups.filter(isActive);
  else if (store.filter === 'mine') visibleGroups = store.groups.filter((g) => g.created_by === store.currentUserId);
  else if (store.filter === 'ended') visibleGroups = store.groups.filter(isEnded);

  const filters: { key: GroupFilter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'active', label: '진행 중' },
    { key: 'mine', label: '내가 만든' },
    { key: 'ended', label: '종료' },
  ];

  const emptyMessages: Record<GroupFilter, string> = {
    all: '아직 그룹이 없습니다',
    active: '진행 중인 그룹이 없습니다',
    mine: '아직 만든 그룹이 없습니다',
    ended: '종료된 그룹이 없습니다',
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-end justify-between px-5 pb-3" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
          <h1 className="text-[26px] font-extrabold tracking-tight text-black">그룹</h1>
          <button
            onClick={() => navigate('/profile')}
            aria-label="프로필"
            className="flex items-center justify-center active:opacity-50 transition-opacity mb-0.5"
          >
            <User size={24} strokeWidth={2} className="text-black" />
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex overflow-x-auto hide-scrollbar gap-1.5 px-5 pb-3">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => store.setFilter(f.key)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-[13px] font-semibold min-h-0 min-w-0 transition-colors ${
                store.filter === f.key
                  ? 'bg-black text-white'
                  : 'bg-black/[0.05] text-black/45'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Group card list */}
        {visibleGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20 gap-3">
            <div className="w-12 h-12 rounded-full bg-black/[0.04] flex items-center justify-center">
              <Plus size={20} className="text-black/20" />
            </div>
            <p className="text-[13px] text-black/35">{emptyMessages[store.filter]}</p>
          </div>
        ) : (
          <div className="px-5 flex flex-col gap-4 pb-4">
            {visibleGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                membersLoading={store.membersLoading}
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
