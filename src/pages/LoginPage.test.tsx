import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const { mockStore, mockSignInWithOAuth } = vi.hoisted(() => ({
  mockStore: {
    user: null as { email: string } | null,
    loading: false,
    initialize: vi.fn(() => () => {}),
  },
  mockSignInWithOAuth: vi.fn(),
}));

vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn(function () { return mockStore; }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
    },
  },
}));

const renderLoginPage = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('next param forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.user = null;
    mockStore.loading = false;
  });

  const renderWithNext = (next: string) =>
    render(
      <MemoryRouter initialEntries={[`/login?next=${encodeURIComponent(next)}`]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    );

  it('구글 로그인 시 next 파라미터를 redirectTo에 포함', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    renderWithNext('/invite/abc-token');
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      const call = mockSignInWithOAuth.mock.calls[0][0];
      expect(call.options.redirectTo).toContain(
        encodeURIComponent('/invite/abc-token')
      );
    });
  });

  it('next가 절대 URL일 때 무시하고 기본 redirectTo 사용', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    renderWithNext('https://evil.com');
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      const call = mockSignInWithOAuth.mock.calls[0][0];
      expect(call.options.redirectTo).toBe(
        `${window.location.origin}/auth/callback`
      );
    });
  });

  it('next가 없을 때 기본 redirectTo 사용', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      const call = mockSignInWithOAuth.mock.calls[0][0];
      expect(call.options.redirectTo).toBe(
        `${window.location.origin}/auth/callback`
      );
    });
  });
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.user = null;
    mockStore.loading = false;
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  it('renders Google and Kakao login buttons', () => {
    renderLoginPage();
    expect(screen.getByRole('button', { name: /구글/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /카카오/i })).toBeInTheDocument();
  });

  it('redirects to / when user is already logged in', () => {
    mockStore.user = { email: 'test@example.com' };
    renderLoginPage();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('disables both buttons while Google login is in progress', async () => {
    mockSignInWithOAuth.mockImplementation(() => new Promise(() => {}));
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /구글/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /카카오/i })).toBeDisabled();
    });
  });

  it('disables both buttons while Kakao login is in progress', async () => {
    mockSignInWithOAuth.mockImplementation(() => new Promise(() => {}));
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /카카오/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /구글/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /카카오/i })).toBeDisabled();
    });
  });
});
