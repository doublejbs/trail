import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GroupMapPage } from './GroupMapPage';

const { mockStore, mockNavigate, mockFrom, mockCreateSignedUrl } = vi.hoisted(() => ({
  mockStore: {
    map: null as naver.maps.Map | null,
    error: false,
    gpxPolyline: null,
    initMap: vi.fn(),
    destroy: vi.fn(),
    locate: vi.fn(),
    drawGpxRoute: vi.fn(),
    clearGpxRoute: vi.fn(),
  },
  mockNavigate: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
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

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: () => ({
        createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
      }),
    },
  },
}));

const FAKE_GROUP = {
  id: 'group-uuid-1',
  name: '한라산 팀',
  created_by: 'user-1',
  gpx_path: 'user-1/group-uuid-1.gpx',
  created_at: '2026-01-01T00:00:00Z',
};

const FAKE_GPX = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="37.5" lon="126.9"></trkpt></trkseg></trk></gpx>`;

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

    // 기본: 그룹 조회 성공
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: FAKE_GROUP, error: null }),
        }),
      }),
    });

    // 기본: Signed URL 생성 성공
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/signed' },
      error: null,
    });

    // 기본: GPX fetch 성공
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(FAKE_GPX),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('그룹을 찾지 못하면 /group으로 리다이렉트', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
        }),
      }),
    });

    renderAt('/group/nonexistent-id');

    await waitFor(() => {
      expect(screen.getByText('group list')).toBeInTheDocument();
    });
  });

  it('그룹 로딩 중 스피너 표시', () => {
    // fetch가 resolve되지 않도록 지연
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => new Promise(() => {}), // 영원히 pending
        }),
      }),
    });

    renderAt('/group/group-uuid-1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('그룹 로드 후 map-container 렌더링', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });

  it('뒤로가기 버튼에 그룹명 표시', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /한라산 팀/ })).toBeInTheDocument();
    });
  });

  it('뒤로가기 버튼 클릭 시 navigate("/group") 호출', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => screen.getByRole('button', { name: /한라산 팀/ }));
    fireEvent.click(screen.getByRole('button', { name: /한라산 팀/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/group');
  });

  it('로드 성공 후 drawGpxRoute 호출', async () => {
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(mockStore.drawGpxRoute).toHaveBeenCalledWith(FAKE_GPX);
    });
  });
});
