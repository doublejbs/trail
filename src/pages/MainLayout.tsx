import { Outlet, useLocation } from 'react-router-dom'
import { BottomTabBar } from '../components/BottomTabBar'

const TAB_PATHS = ['/group', '/course', '/profile'];

export function MainLayout() {
  const location = useLocation();
  const showTabBar = TAB_PATHS.includes(location.pathname);

  return (
    <div className="relative h-screen bg-white overflow-hidden">
      <div className={`absolute inset-0 ${showTabBar ? 'pb-[72px]' : ''}`}>
        <Outlet />
      </div>
      {showTabBar && <BottomTabBar />}
    </div>
  )
}
