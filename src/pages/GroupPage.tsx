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
      <div className="h-full flex items-center justify-center bg-black">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (store.error) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <p className="text-sm text-neutral-400">그룹을 불러올 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto bg-black">
      {store.groups.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <p className="text-sm text-neutral-400">아직 그룹이 없습니다</p>
        </div>
      ) : (
        store.groups.map((group) => (
          <button
            key={group.id}
            onClick={() => navigate(`/group/${group.id}`)}
            className="w-full px-4 py-4 text-left text-white border-b border-neutral-800 active:bg-neutral-800"
          >
            {group.name}
          </button>
        ))
      )}
      <button
        onClick={() => navigate('/group/new')}
        aria-label="그룹 만들기"
        className="absolute right-4 bottom-4 w-12 h-12 bg-white text-black rounded-full flex items-center justify-center shadow-lg active:bg-neutral-100"
      >
        <Plus size={22} />
      </button>
    </div>
  );
});
