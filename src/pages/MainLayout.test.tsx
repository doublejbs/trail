import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from './MainLayout'

vi.mock('../components/BottomTabBar', () => ({
  BottomTabBar: () => <div data-testid="bottom-tab-bar" />,
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<div>child content</div>} />
          <Route path="group" element={<div>child content</div>} />
          <Route path="group/:id" element={<div>child content</div>} />
          <Route path="profile" element={<div>child content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('MainLayout', () => {
  it('탭 경로(/group)에서 BottomTabBar 렌더링', () => {
    renderAt('/group');
    expect(screen.getByTestId('bottom-tab-bar')).toBeInTheDocument();
  });

  it('탭 경로(/profile)에서 BottomTabBar 렌더링', () => {
    renderAt('/profile');
    expect(screen.getByTestId('bottom-tab-bar')).toBeInTheDocument();
  });

  it('서브 경로(/group/:id)에서 BottomTabBar 미렌더링', () => {
    renderAt('/group/123');
    expect(screen.queryByTestId('bottom-tab-bar')).not.toBeInTheDocument();
  });

  it('Outlet 영역에 자식 라우트 렌더링', () => {
    renderAt('/group');
    expect(screen.getByText('child content')).toBeInTheDocument();
  });
})
