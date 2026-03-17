import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    user: null as { email: string } | null,
    loading: true,
    initialize: vi.fn(() => () => {}),
  },
}));

vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn(function () { return mockStore; }),
}));

const renderWithRouter = (initialPath = '/') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe('ProtectedRoute', () => {
  it('shows spinner while loading', () => {
    mockStore.user = null;
    mockStore.loading = true;
    renderWithRouter();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login when no user', () => {
    mockStore.user = null;
    mockStore.loading = false;
    renderWithRouter();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated', () => {
    mockStore.user = { email: 'test@example.com' };
    mockStore.loading = false;
    renderWithRouter();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
