import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { observable, runInAction } from 'mobx';
import { LoginPage } from './LoginPage';

const { mockAuthStore } = vi.hoisted(() => ({
  mockAuthStore: {
    user: null as { email: string } | null,
    loading: false,
    initialize: vi.fn(() => () => {}),
  },
}));

vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn(function () { return mockAuthStore; }),
}));

const mockLoginFn = vi.fn();
const mockLoginStore = observable({
  loadingProvider: null as 'google' | 'kakao' | null,
  get isLoading() { return this.loadingProvider !== null; },
  login: mockLoginFn,
});

vi.mock('../stores/LoginStore', () => ({
  LoginStore: vi.fn(function () { return mockLoginStore; }),
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
    mockAuthStore.user = null;
    mockAuthStore.loading = false;
    mockLoginFn.mockResolvedValue(undefined);
    runInAction(() => { mockLoginStore.loadingProvider = null; });
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
    renderWithNext('/invite/abc-token');
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      const [, redirectTo] = mockLoginFn.mock.calls[0];
      expect(redirectTo).toContain(encodeURIComponent('/invite/abc-token'));
    });
  });

  it('next가 절대 URL일 때 무시하고 기본 redirectTo 사용', async () => {
    renderWithNext('https://evil.com');
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      const [, redirectTo] = mockLoginFn.mock.calls[0];
      expect(redirectTo).toBe(`${window.location.origin}/auth/callback`);
    });
  });

  it('next가 없을 때 기본 redirectTo 사용', async () => {
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      const [, redirectTo] = mockLoginFn.mock.calls[0];
      expect(redirectTo).toBe(`${window.location.origin}/auth/callback`);
    });
  });
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStore.user = null;
    mockAuthStore.loading = false;
    mockLoginFn.mockResolvedValue(undefined);
    runInAction(() => { mockLoginStore.loadingProvider = null; });
  });

  it('renders Google and Kakao login buttons', () => {
    renderLoginPage();
    expect(screen.getByRole('button', { name: /구글/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /카카오/i })).toBeInTheDocument();
  });

  it('redirects to / when user is already logged in', () => {
    mockAuthStore.user = { email: 'test@example.com' };
    renderLoginPage();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('disables both buttons while Google login is in progress', async () => {
    mockLoginFn.mockImplementation(() => {
      runInAction(() => { mockLoginStore.loadingProvider = 'google'; });
      return new Promise(() => {});
    });
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /구글/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /카카오/i })).toBeDisabled();
    });
  });

  it('disables both buttons while Kakao login is in progress', async () => {
    mockLoginFn.mockImplementation(() => {
      runInAction(() => { mockLoginStore.loadingProvider = 'kakao'; });
      return new Promise(() => {});
    });
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /카카오/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /구글/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /카카오/i })).toBeDisabled();
    });
  });
});
