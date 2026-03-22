import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus } from 'lucide-react';
import { GroupStore } from '../stores/GroupStore';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { LargeTitle } from '../components/LargeTitle';

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

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Group list */}
      <div className="flex-1 overflow-y-auto pb-2">
        <LargeTitle title="그룹" />
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

      {/* Bottom control bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-200 bg-white shrink-0">
        {/* Segmented chip */}
        <div className="flex-1 flex justify-center">
          <ButtonGroup className="bg-neutral-100 p-0.5">
            <Button
              onClick={() => store.setActiveTab('owned')}
              aria-pressed={store.activeTab === 'owned'}
              variant={store.activeTab === 'owned' ? 'default' : 'ghost'}
              size="sm"
              className={store.activeTab !== 'owned' ? 'text-neutral-400' : ''}
            >
              내가 만든
            </Button>
            <Button
              onClick={() => store.setActiveTab('joined')}
              aria-pressed={store.activeTab === 'joined'}
              variant={store.activeTab === 'joined' ? 'default' : 'ghost'}
              size="sm"
              className={store.activeTab !== 'joined' ? 'text-neutral-400' : ''}
            >
              참여중
            </Button>
          </ButtonGroup>
        </div>
        {/* FAB */}
        <button
          onClick={() => navigate('/group/new')}
          aria-label="그룹 만들기"
          className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center shadow-lg active:bg-neutral-800"
        >
          <Plus size={22} />
        </button>
      </div>
    </div>
  );
});
