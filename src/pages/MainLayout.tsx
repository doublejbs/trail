import { Outlet, useLocation } from 'react-router-dom'
import { BottomTabBar } from '../components/BottomTabBar'

const TAB_PATHS = ['/group', '/course', '/profile'];

export function MainLayout() {
  const location = useLocation();
  const showTabBar = TAB_PATHS.includes(location.pathname);

  return (
    <div className="relative bg-white overflow-hidden" style={{ height: '100dvh' }}>
      <div className={`absolute inset-0 ${showTabBar ? 'pb-[calc(56px+env(safe-area-inset-bottom))]' : ''}`}>
        <Outlet />
      </div>
      {showTabBar && <BottomTabBar />}
    </div>
  )
}
