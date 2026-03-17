import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    user: null,
    loading: false,
    initialize: vi.fn(() => () => {}),
    signOut: vi.fn(),
  },
}));

vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn(function () { return mockStore; }),
}));

describe('ProfilePage', () => {
  it('로그아웃 버튼 렌더링', () => {
    render(<ProfilePage />);
    expect(screen.getByRole('button', { name: /로그아웃/i })).toBeInTheDocument();
  });

  it('로그아웃 버튼 클릭 시 signOut 호출', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/i }));
    expect(mockStore.signOut).toHaveBeenCalledOnce();
  });
});
