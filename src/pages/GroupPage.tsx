import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus } from 'lucide-react';
import { GroupStore } from '../stores/GroupStore';

export const GroupPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupStore());

  useEffect(() => {
    store.load();
  }, [store]);

  if (store.loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (store.error) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <p className="text-sm text-neutral-400">그룹을 불러올 수 없습니다</p>
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

  const tabClass = (tab: 'owned' | 'joined') =>
    `flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
      store.activeTab === tab
        ? 'border-black text-black'
        : 'border-transparent text-neutral-400'
    }`;

  return (
    <div className="relative h-full flex flex-col bg-white">
      {/* Tab bar */}
      <div className="flex border-b border-neutral-200 shrink-0">
        <button
          className={tabClass('owned')}
          onClick={() => store.setActiveTab('owned')}
        >
          내가 만든 그룹
        </button>
        <button
          className={tabClass('joined')}
          onClick={() => store.setActiveTab('joined')}
        >
          참여중인 그룹
        </button>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto">
        {visibleGroups.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-neutral-400">{emptyMessage}</p>
          </div>
        ) : (
          visibleGroups.map((group) => (
            <button
              key={group.id}
              onClick={() => navigate(`/group/${group.id}`)}
              className="w-full px-4 py-4 text-left text-black border-b border-neutral-200 active:bg-neutral-100"
            >
              {group.name}
            </button>
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/group/new')}
        aria-label="그룹 만들기"
        className="absolute right-4 bottom-4 w-12 h-12 bg-black text-white rounded-full flex items-center justify-center shadow-lg active:bg-neutral-800"
      >
        <Plus size={22} />
      </button>
    </div>
  );
});
