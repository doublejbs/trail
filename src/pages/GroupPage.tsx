import { useNavigate } from 'react-router-dom';
import { DUMMY_GROUPS } from '../data/groups';

export function GroupPage() {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto bg-black">
      {DUMMY_GROUPS.map((group) => (
        <button
          key={group.id}
          onClick={() => navigate(`/group/${group.id}`)}
          className="w-full px-4 py-4 text-left text-white border-b border-neutral-800 active:bg-neutral-800"
        >
          {group.name}
        </button>
      ))}
    </div>
  );
}
