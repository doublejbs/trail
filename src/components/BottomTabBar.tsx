import { useLocation, useNavigate } from 'react-router-dom';
import { Users, Map, User } from 'lucide-react';
import type { ReactNode } from 'react';

interface Tab {
  path: string;
  label: string;
  icon: ReactNode;
}

const TABS: Tab[] = [
  { path: '/group', label: '그룹', icon: <Users size={20} strokeWidth={2} /> },
  { path: '/course', label: '코스', icon: <Map size={20} strokeWidth={2} /> },
  { path: '/profile', label: '프로필', icon: <User size={20} strokeWidth={2} /> },
];

function isActive(tabPath: string, currentPath: string): boolean {
  return currentPath.startsWith(tabPath);
}

export function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="absolute bottom-0 left-0 right-0 px-6 pb-6">
      <div
        className="flex items-stretch rounded-[28px] p-1"
        style={{
          background: 'rgba(28, 28, 30, 0.82)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.28), 0 1.5px 0 rgba(255,255,255,0.08) inset',
        }}
      >
        {TABS.map((tab) => {
          const active = isActive(tab.path, location.pathname);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-2 rounded-[20px] transition-all duration-200"
              aria-label={tab.label}
            >
              <span
                className={`transition-all duration-200 ${
                  active ? 'text-white' : 'text-white/40'
                }`}
              >
                {tab.icon}
              </span>
              <span
                className={`text-[10px] leading-none tracking-tight transition-all duration-200 ${
                  active ? 'text-white font-semibold' : 'text-white/40 font-normal'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
