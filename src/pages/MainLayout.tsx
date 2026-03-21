import { Outlet, useLocation } from 'react-router-dom'
import { BottomTabBar } from '../components/BottomTabBar'

const HIDE_TAB_BAR_PREFIXES = ['/group/', '/course/new'];

export function MainLayout() {
  const location = useLocation();
  const showTabBar = !HIDE_TAB_BAR_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

  return (
    <div className="relative h-screen bg-white overflow-hidden">
      <div className={`absolute inset-0 ${showTabBar ? 'pb-24' : ''}`}>
        <Outlet />
      </div>
      {showTabBar && <BottomTabBar />}
    </div>
  )
}
