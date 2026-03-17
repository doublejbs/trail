import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProfilePage } from './ProfilePage'

const { mockSignOut } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}))

describe('ProfilePage', () => {
  it('로그아웃 버튼 렌더링', () => {
    render(<ProfilePage />)
    expect(screen.getByRole('button', { name: /로그아웃/i })).toBeInTheDocument()
  })

  it('로그아웃 버튼 클릭 시 signOut 호출', () => {
    render(<ProfilePage />)
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })
})
