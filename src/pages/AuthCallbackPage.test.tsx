import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthCallbackPage } from './AuthCallbackPage';

const { mockExchangeCode } = vi.hoisted(() => ({
  mockExchangeCode: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCode(...args),
    },
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
      </Routes>
    </MemoryRouter>
  );

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner initially', () => {
    mockExchangeCode.mockImplementation(() => new Promise(() => {}));
    renderCallback();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('redirects to / once exchange succeeds and user is set', async () => {
    mockExchangeCode.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
  });

  it('redirects to /login on error', async () => {
    mockExchangeCode.mockResolvedValue({ data: { session: null }, error: { message: 'auth error' } });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });

  it('redirects to next param path on success', async () => {
    mockExchangeCode.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
    renderCallback('?code=abc&next=%2Fmap');
    await waitFor(() => {
      expect(screen.getByText('Map Page')).toBeInTheDocument();
    });
  });

  it('redirects to /login when no code param', async () => {
    renderCallback('');
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });
});
