import { useAuth } from '../contexts/AuthContext'

export function HomePage() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
      <h1 className="text-2xl font-bold tracking-tight">Trail</h1>
      <p className="text-sm text-neutral-500">{user?.email} 으로 로그인됨</p>
      <button
        className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        onClick={signOut}
      >
        로그아웃
      </button>
    </div>
  )
}
