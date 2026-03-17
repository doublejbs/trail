import { Button } from '@/components/ui/button'
import { useAuth } from '../contexts/AuthContext'

export function ProfilePage() {
  const { signOut } = useAuth()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-white">
      <p className="text-lg font-semibold">프로필</p>
      <p className="text-sm text-neutral-400">준비 중</p>
      <Button variant="outline" onClick={signOut}>
        로그아웃
      </Button>
    </div>
  )
}
