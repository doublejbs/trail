import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus, User } from 'lucide-react';
import { GroupStore } from '../stores/GroupStore';
import { GroupCard } from '../components/GroupCard';

export const MyGroupsPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupStore());
  const [onlyMine, setOnlyMine] = useState(false);

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

  const joinedGroups = store.groups.filter((g) => store.joinedGroupIds.has(g.id));
  const visibleGroups = onlyMine
    ? joinedGroups.filter((g) => g.created_by === store.currentUserId)
    : joinedGroups;
  const emptyMessage = onlyMine ? '내가 만든 그룹이 없습니다' : '참가중인 그룹이 없습니다';

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-end justify-between px-5 pb-3" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
          <h1 className="text-[26px] font-extrabold tracking-tight text-black">참가중</h1>
          <button
            onClick={() => navigate('/profile')}
            aria-label="프로필"
            className="flex items-center justify-center active:opacity-50 transition-opacity mb-0.5"
          >
            <User size={24} strokeWidth={2} className="text-black" />
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-1.5 px-5 pb-3">
          <button
            onClick={() => setOnlyMine(false)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-semibold min-h-0 min-w-0 transition-colors ${
              !onlyMine ? 'bg-black text-white' : 'bg-black/[0.05] text-black/45'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setOnlyMine(true)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-semibold min-h-0 min-w-0 transition-colors ${
              onlyMine ? 'bg-black text-white' : 'bg-black/[0.05] text-black/45'
            }`}
          >
            내가 만든
          </button>
        </div>

        {visibleGroups.length === 0 ? (
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
                membersLoading={store.membersLoading}
                onClick={() => navigate(`/group/${group.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
