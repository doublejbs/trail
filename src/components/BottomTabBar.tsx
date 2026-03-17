import { useLocation, useNavigate } from 'react-router-dom';
import { Users, Clock, User } from 'lucide-react';
import type { ReactNode } from 'react';

interface Tab {
  path: string;
  label: string;
  icon: ReactNode;
}

const TABS: Tab[] = [
  { path: '/group', label: '그룹', icon: <Users size={22} strokeWidth={2} /> },
  { path: '/history', label: '기록', icon: <Clock size={22} strokeWidth={2} /> },
  { path: '/profile', label: '프로필', icon: <User size={22} strokeWidth={2} /> },
];

function isActive(tabPath: string, currentPath: string): boolean {
  return currentPath.startsWith(tabPath);
}

export function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="bg-black border-t border-[#222] flex-shrink-0">
      <div className="flex justify-around items-center pt-2 pb-1">
        {TABS.map((tab) => {
          const active = isActive(tab.path, location.pathname);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center gap-[3px] min-w-[52px] py-1"
              aria-label={tab.label}
            >
              <span className={active ? 'text-white' : 'text-[#555]'}>
                {tab.icon}
              </span>
              <span
                className={`text-[9px] tracking-tight ${
                  active ? 'text-white font-semibold' : 'text-[#555] font-normal'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
      {/* iOS 홈 인디케이터 */}
      <div className="flex justify-center pb-[6px] pt-1">
        <div className="w-[100px] h-[4px] bg-white/30 rounded-full" />
      </div>
    </div>
  );
}
