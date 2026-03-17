import { Outlet } from 'react-router-dom'
import { BottomTabBar } from '../components/BottomTabBar'

export function MainLayout() {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 relative overflow-hidden">
        <Outlet />
      </div>
      <BottomTabBar />
    </div>
  )
}
