import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from './MainLayout'

vi.mock('../components/BottomTabBar', () => ({
  BottomTabBar: () => <div data-testid="bottom-tab-bar" />,
}))

describe('MainLayout', () => {
  it('BottomTabBar 렌더링', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<div>child content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('bottom-tab-bar')).toBeInTheDocument()
  })

  it('Outlet 영역에 자식 라우트 렌더링', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<div>child content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
