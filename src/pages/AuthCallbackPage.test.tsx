import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { AuthCallbackPage } from './AuthCallbackPage';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    user: null as User | null,
    exchangeCode: vi.fn(),
  },
}));

vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn(function () { return mockStore; }),
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

const fakeUser = { id: 'user-1' } as User;

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.user = null;
  });

  it('shows loading spinner initially', () => {
    mockStore.exchangeCode.mockImplementation(() => new Promise(() => {}));
    renderCallback();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('redirects to / once exchange succeeds and user is set', async () => {
    mockStore.exchangeCode.mockResolvedValue(true);
    mockStore.user = fakeUser;
    renderCallback();
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
  });

  it('redirects to /login on error', async () => {
    mockStore.exchangeCode.mockResolvedValue(false);
    renderCallback();
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
  });

  it('redirects to next param path on success', async () => {
    mockStore.exchangeCode.mockResolvedValue(true);
    mockStore.user = fakeUser;
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
