import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [exchanged, setExchanged] = useState(false)
  const attemptedRef = useRef(false)
  const next = searchParams.get('next') ?? '/'

  // Step 1: exchange the code (once — guard against StrictMode double-invoke)
  useEffect(() => {
    if (attemptedRef.current) return
    attemptedRef.current = true

    const code = searchParams.get('code')
    if (!code) {
      navigate('/login', { replace: true })
      return
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        navigate('/login', { replace: true })
      } else {
        setExchanged(true)
      }
    })
  }, [navigate, searchParams])

  // Step 2: navigate only after user is confirmed in context
  useEffect(() => {
    if (exchanged && user) {
      navigate(next, { replace: true })
    }
  }, [exchanged, user, navigate, next])

  return (
    <div
      role="status"
      className="flex h-screen items-center justify-center"
      aria-label="로그인 처리 중"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-transparent" />
    </div>
  )
}
