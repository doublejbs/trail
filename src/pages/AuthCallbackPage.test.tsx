import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthCallbackPage } from './AuthCallbackPage';

const { mockGetSession, mockOnAuthStateChange, mockProfileSelect } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockProfileSelect: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockProfileSelect(),
        }),
      }),
    }),
  },
}));

const renderCallback = (search = '?code=test-code') =>
  render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<div>Home</div>} />
        <Route path="/login" element={<div>Login</div>} />
        <Route path="/map" element={<div>Map Page</div>} />
        <Route path="/setup-profile" element={<div>Setup Profile</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileSelect.mockResolvedValue({ data: { display_name: 'User' } });
  });

  it('shows loading spinner initially', () => {
    mockGetSession.mockImplementation(() => new Promise(() => {}));
    renderCallback();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('redirects to / once exchange succeeds and user is set', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
  });

  it('redirects to /login on error', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: null) => void) => {
      const sub = { unsubscribe: vi.fn() };
      setTimeout(() => cb('INITIAL_SESSION', null), 0);
      return { data: { subscription: sub } };
    });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });

  it('redirects to next param path on success', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    renderCallback('?code=abc&next=%2Fmap');
    await waitFor(() => {
      expect(screen.getByText('Map Page')).toBeInTheDocument();
    });
  });

  it('redirects to /login when no code param', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: null) => void) => {
      const sub = { unsubscribe: vi.fn() };
      setTimeout(() => cb('INITIAL_SESSION', null), 0);
      return { data: { subscription: sub } };
    });
    renderCallback('');
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });
});
