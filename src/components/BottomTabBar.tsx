import { useLocation, useNavigate } from 'react-router-dom';
import { Users, Compass, Flame } from 'lucide-react';
import type { ReactNode } from 'react';

interface Tab {
  path: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const TABS: Tab[] = [
  {
    path: '/group',
    label: '그룹',
    icon: (a) => <Users size={22} strokeWidth={a ? 2.2 : 1.6} />,
  },
  {
    path: '/my',
    label: '참가중',
    icon: (a) => <Flame size={22} strokeWidth={a ? 2.2 : 1.6} />,
  },
  {
    path: '/course',
    label: '코스',
    icon: (a) => <Compass size={22} strokeWidth={a ? 2.2 : 1.6} />,
  },
];

const isActive = (tabPath: string, currentPath: string): boolean => {
  return currentPath.startsWith(tabPath);
};

export const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-black/[0.06]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-stretch">
        {TABS.map((tab) => {
          const active = isActive(tab.path, location.pathname);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 pt-2 pb-2 transition-colors"
              aria-label={tab.label}
            >
              <span className={active ? 'text-black' : 'text-black/30'}>
                {tab.icon(active)}
              </span>
              <span
                className={`text-[11px] font-semibold tracking-wide ${
                  active ? 'text-black' : 'text-black/30'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
