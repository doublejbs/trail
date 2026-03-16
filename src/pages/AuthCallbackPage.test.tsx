import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthCallbackPage } from './AuthCallbackPage'

const { mockExchangeCodeForSession } = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
    },
  },
}))

const renderCallback = (search = '?code=test-code') =>
  render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<div>Home</div>} />
        <Route path="/login" element={<div>Login</div>} />
        <Route path="/map" element={<div>Map Page</div>} />
      </Routes>
    </MemoryRouter>
  )

describe('AuthCallbackPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading spinner initially', () => {
    mockExchangeCodeForSession.mockImplementation(() => new Promise(() => {}))
    renderCallback()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('redirects to / on successful code exchange', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    renderCallback()
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument()
    })
  })

  it('redirects to /login on error', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid code' } })
    renderCallback()
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument()
    })
  })

  it('redirects to next param path on success', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    renderCallback('?code=abc&next=%2Fmap')
    await waitFor(() => {
      expect(screen.getByText('Map Page')).toBeInTheDocument()
    })
  })

  it('redirects to /login when no code param', async () => {
    renderCallback('')
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument()
    })
  })
})
