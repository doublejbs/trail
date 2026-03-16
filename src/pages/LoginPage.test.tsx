import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LoginPage } from './LoginPage'

const { mockUseAuth, mockSignInWithOAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockSignInWithOAuth: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: () => mockSignInWithOAuth(),
    },
  },
}))

const renderLoginPage = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  )

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignInWithOAuth.mockResolvedValue({ error: null })
  })

  it('renders Google and Kakao login buttons', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    renderLoginPage()
    expect(screen.getByRole('button', { name: /구글/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /카카오/i })).toBeInTheDocument()
  })

  it('redirects to / when user is already logged in', () => {
    mockUseAuth.mockReturnValue({ user: { email: 'test@example.com' }, loading: false })
    renderLoginPage()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('disables both buttons while Google login is in progress', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockSignInWithOAuth.mockImplementation(() => new Promise(() => {}))
    renderLoginPage()

    fireEvent.click(screen.getByRole('button', { name: /구글/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /구글/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /카카오/i })).toBeDisabled()
    })
  })

  it('disables both buttons while Kakao login is in progress', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockSignInWithOAuth.mockImplementation(() => new Promise(() => {}))
    renderLoginPage()

    fireEvent.click(screen.getByRole('button', { name: /카카오/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /구글/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /카카오/i })).toBeDisabled()
    })
  })
})
