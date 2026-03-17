import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomTabBar } from './BottomTabBar';

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderBar = (path = '/group') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BottomTabBar />
    </MemoryRouter>
  );

describe('BottomTabBar', () => {
  it('3개 탭만 렌더링 (지도 없음)', () => {
    renderBar('/group');
    expect(screen.getByText('그룹')).toBeInTheDocument();
    expect(screen.getByText('기록')).toBeInTheDocument();
    expect(screen.getByText('프로필')).toBeInTheDocument();
    expect(screen.queryByText('지도')).not.toBeInTheDocument();
  });

  it('/group 경로에서 그룹 탭이 활성', () => {
    renderBar('/group');
    expect(screen.getByText('그룹')).toHaveClass('text-white');
    expect(screen.getByText('기록')).not.toHaveClass('text-white');
  });

  it('/group/0 경로에서 그룹 탭이 활성 (startsWith)', () => {
    renderBar('/group/0');
    expect(screen.getByText('그룹')).toHaveClass('text-white');
    expect(screen.getByText('기록')).not.toHaveClass('text-white');
  });

  it('탭 클릭 시 해당 경로로 navigate', () => {
    renderBar('/group');
    fireEvent.click(screen.getByText('기록'));
    expect(mockNavigate).toHaveBeenCalledWith('/history');
  });
});
