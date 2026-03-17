import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomTabBar } from './BottomTabBar'

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const renderBar = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BottomTabBar />
    </MemoryRouter>
  )

describe('BottomTabBar', () => {
  it('4개 탭 렌더링', () => {
    renderBar('/')
    expect(screen.getByText('지도')).toBeInTheDocument()
    expect(screen.getByText('그룹')).toBeInTheDocument()
    expect(screen.getByText('기록')).toBeInTheDocument()
    expect(screen.getByText('프로필')).toBeInTheDocument()
  })

  it('/ 경로에서 지도 탭이 활성', () => {
    renderBar('/')
    const 지도 = screen.getByText('지도')
    const 그룹 = screen.getByText('그룹')
    expect(지도).toHaveClass('text-white')
    expect(그룹).not.toHaveClass('text-white')
  })

  it('/group 경로에서 그룹 탭이 활성', () => {
    renderBar('/group')
    expect(screen.getByText('그룹')).toHaveClass('text-white')
    expect(screen.getByText('지도')).not.toHaveClass('text-white')
  })

  it('탭 클릭 시 해당 경로로 navigate', () => {
    renderBar('/')
    fireEvent.click(screen.getByText('그룹'))
    expect(mockNavigate).toHaveBeenCalledWith('/group')
  })

  it('/ 탭은 정확히 / 일 때만 활성 (하위 경로 제외)', () => {
    renderBar('/group')
    expect(screen.getByText('지도')).not.toHaveClass('text-white')
  })
})
