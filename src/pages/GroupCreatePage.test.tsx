// src/pages/GroupCreatePage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

type SourceMode = 'course' | 'file';

function makeMockStore(overrides: Partial<{
  name: string;
  sourceMode: SourceMode;
  courses: { id: string; name: string; distance_m: number | null; elevation_gain_m: number | null; gpx_path: string }[];
  coursesLoading: boolean;
  selectedCourseId: string | null;
  file: File | null;
}> = {}) {
  return class {
    name = overrides.name ?? '';
    sourceMode: SourceMode = overrides.sourceMode ?? 'course';
    courses = overrides.courses ?? [];
    coursesLoading = overrides.coursesLoading ?? false;
    selectedCourseId: string | null = overrides.selectedCourseId ?? null;
    file: File | null = overrides.file ?? null;
    submitting = false;
    error: string | null = null;
    get isValid() {
      if (this.name.trim() === '') return false;
      if (this.sourceMode === 'course') return this.selectedCourseId !== null;
      return this.file !== null;
    }
    setName = vi.fn((v: string) => { this.name = v; });
    setFile = vi.fn();
    setSourceMode = vi.fn((m: SourceMode) => { this.sourceMode = m; });
    setSelectedCourseId = vi.fn((id: string | null) => { this.selectedCourseId = id; });
    submit = vi.fn().mockResolvedValue(null);
  };
}

describe('GroupCreatePage', () => {
  it('기본적으로 코스 선택 탭이 활성화된다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => ({ supabase: {} }));
    vi.doMock('../stores/GroupCreateStore', () => ({
      GroupCreateStore: makeMockStore(),
    }));
    const { GroupCreatePage } = await import('./GroupCreatePage');
    render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '코스 선택' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'GPX 업로드' })).toBeTruthy();
  });

  it('코스 로딩 중엔 스피너가 표시된다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => ({ supabase: {} }));
    vi.doMock('../stores/GroupCreateStore', () => ({
      GroupCreateStore: makeMockStore({ coursesLoading: true }),
    }));
    const { GroupCreatePage } = await import('./GroupCreatePage');
    const { container } = render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('코스가 없으면 안내 문구가 표시된다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => ({ supabase: {} }));
    vi.doMock('../stores/GroupCreateStore', () => ({
      GroupCreateStore: makeMockStore({ courses: [] }),
    }));
    const { GroupCreatePage } = await import('./GroupCreatePage');
    render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
    expect(screen.getByText('등록된 코스가 없습니다')).toBeTruthy();
  });

  it('코스 카드가 목록으로 표시된다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => ({ supabase: {} }));
    vi.doMock('../stores/GroupCreateStore', () => ({
      GroupCreateStore: makeMockStore({
        courses: [
          { id: 'c1', name: '북한산 둘레길', distance_m: 12400, elevation_gain_m: 340, gpx_path: 'a' },
          { id: 'c2', name: '한강공원', distance_m: null, elevation_gain_m: null, gpx_path: 'b' },
        ],
      }),
    }));
    const { GroupCreatePage } = await import('./GroupCreatePage');
    render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
    expect(screen.getByText('북한산 둘레길')).toBeTruthy();
    expect(screen.getByText('한강공원')).toBeTruthy();
    expect(screen.getByText(/12\.4 km/)).toBeTruthy();
  });

  it('코스 선택 후 그룹 만들기 버튼이 활성화된다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => ({ supabase: {} }));
    vi.doMock('../stores/GroupCreateStore', () => ({
      GroupCreateStore: makeMockStore({
        name: '내 그룹',
        courses: [{ id: 'c1', name: '북한산', distance_m: null, elevation_gain_m: null, gpx_path: 'a' }],
        selectedCourseId: 'c1',
      }),
    }));
    const { GroupCreatePage } = await import('./GroupCreatePage');
    render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
    const btn = screen.getByRole('button', { name: /그룹 만들기/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('GPX 업로드 탭에서 파일 선택 UI가 표시된다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => ({ supabase: {} }));
    vi.doMock('../stores/GroupCreateStore', () => ({
      GroupCreateStore: makeMockStore({ sourceMode: 'file' }),
    }));
    const { GroupCreatePage } = await import('./GroupCreatePage');
    const { container } = render(<MemoryRouter><GroupCreatePage /></MemoryRouter>);
    // label이 파일 선택 UI, input은 hidden으로 label에 연결됨
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
    expect(screen.getByText('파일 선택')).toBeTruthy();
  });
});
