import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapPage } from './MapPage';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    map: null as naver.maps.Map | null,
    error: false,
    initMap: vi.fn(),
    locate: vi.fn(),
  },
}));

vi.mock('../stores/MapStore', () => ({
  MapStore: vi.fn(function () { return mockStore; }),
}));

describe('MapPage', () => {
  it('지도 초기화 중에는 아무것도 표시 안 함', () => {
    mockStore.map = null;
    mockStore.error = false;
    const { container } = render(<MapPage />);
    expect(screen.queryByText(/지도를 불러올/i)).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="map-container"]')).toBeInTheDocument();
  });

  it('error=true면 에러 메시지 표시', () => {
    mockStore.map = null;
    mockStore.error = true;
    render(<MapPage />);
    expect(screen.getByText('지도를 불러올 수 없습니다')).toBeInTheDocument();
  });

  it('map이 있으면 에러 메시지 없음', () => {
    mockStore.map = {} as naver.maps.Map;
    mockStore.error = false;
    render(<MapPage />);
    expect(screen.queryByText('지도를 불러올 수 없습니다')).not.toBeInTheDocument();
  });

  it('map이 있으면 내 위치 버튼 표시', () => {
    mockStore.map = {} as naver.maps.Map;
    mockStore.error = false;
    render(<MapPage />);
    expect(screen.getByRole('button', { name: '내 위치' })).toBeInTheDocument();
  });

  it('map이 null이면 내 위치 버튼 없음', () => {
    mockStore.map = null;
    mockStore.error = false;
    render(<MapPage />);
    expect(screen.queryByRole('button', { name: '내 위치' })).not.toBeInTheDocument();
  });
});
