import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';

const { mockAuthStore, mockProfileStore } = vi.hoisted(() => ({
  mockAuthStore: {
    user: null,
    loading: false,
    initialize: vi.fn(() => () => {}),
    signOut: vi.fn(),
  },
  mockProfileStore: {
    displayName: '테스트',
    loading: false,
    saving: false,
    load: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
  },
}));

vi.mock('../stores/AuthStore', () => ({
  AuthStore: vi.fn(function () { return mockAuthStore; }),
}));

vi.mock('../stores/ProfileStore', () => ({
  ProfileStore: vi.fn(function () { return mockProfileStore; }),
}));

describe('ProfilePage', () => {
  it('로그아웃 버튼 렌더링', () => {
    render(<ProfilePage />);
    expect(screen.getByRole('button', { name: /로그아웃/i })).toBeInTheDocument();
  });

  it('로그아웃 버튼 클릭 시 signOut 호출', () => {
    render(<ProfilePage />);
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/i }));
    expect(mockAuthStore.signOut).toHaveBeenCalledOnce();
  });
});
