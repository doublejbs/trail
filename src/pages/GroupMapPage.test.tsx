import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GroupMapPage } from './GroupMapPage';

const { mockStore, mockNavigate } = vi.hoisted(() => ({
  mockStore: {
    map: null as naver.maps.Map | null,
    error: false,
    initMap: vi.fn(),
    destroy: vi.fn(),
    locate: vi.fn(),
  },
  mockNavigate: vi.fn(),
}));

vi.mock('../stores/MapStore', () => ({
  MapStore: vi.fn(function () { return mockStore; }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/group/:id" element={<GroupMapPage />} />
        <Route path="/group" element={<div>group list</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('GroupMapPage', () => {
  beforeEach(() => {
    mockStore.map = null;
    mockStore.error = false;
    vi.clearAllMocks();
  });

  it('유효하지 않은 id(99)는 /group으로 리다이렉트', () => {
    renderAt('/group/99');
    expect(screen.getByText('group list')).toBeInTheDocument();
  });

  it('숫자가 아닌 id(abc)는 /group으로 리다이렉트', () => {
    renderAt('/group/abc');
    expect(screen.getByText('group list')).toBeInTheDocument();
  });

  it('유효한 id(0)는 map-container를 렌더링', () => {
    renderAt('/group/0');
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('유효한 id(0)는 그룹명을 back 버튼에 표시', () => {
    renderAt('/group/0');
    expect(screen.getByRole('button', { name: /한라산 팀/ })).toBeInTheDocument();
  });

  it('back 버튼 클릭 시 navigate("/group") 호출', () => {
    renderAt('/group/0');
    fireEvent.click(screen.getByRole('button', { name: /한라산 팀/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/group');
  });
});
