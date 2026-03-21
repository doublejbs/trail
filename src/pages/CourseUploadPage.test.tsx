// src/pages/CourseUploadPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../stores/MapStore', () => ({
  MapStore: class {
    map = null;
    error = false;
    initMap = vi.fn();
    drawGpxRoute = vi.fn();
    destroy = vi.fn();
  },
}));

vi.mock('../lib/supabase', () => ({ supabase: {} }));

// ─── helpers ────────────────────────────────────────────────────────────────

function makeMockStore(overrides: Partial<{
  name: string;
  file: File | null;
  gpxError: string | null;
}> = {}) {
  return class {
    name = overrides.name ?? '';
    description = '';
    tags: string[] = [];
    file: File | null = overrides.file ?? null;
    gpxError: string | null = overrides.gpxError ?? null;
    submitting = false;
    error: string | null = null;
    get isValid() {
      return this.name.trim() !== '' && this.file !== null && !this.gpxError;
    }
    setName = vi.fn((v: string) => { this.name = v; });
    setDescription = vi.fn();
    addTag = vi.fn();
    removeTag = vi.fn();
    setFile = vi.fn();
    submit = vi.fn().mockResolvedValue(null);
  };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('CourseUploadPage', () => {
  it('renders upload button disabled when form is empty', async () => {
    vi.doMock('../stores/CourseUploadStore', () => ({
      CourseUploadStore: makeMockStore(),
    }));

    const { CourseUploadPage } = await import('./CourseUploadPage');
    render(
      <MemoryRouter>
        <CourseUploadPage />
      </MemoryRouter>,
    );

    const btn = screen.getByRole('button', { name: /업로드/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows GPX error message when gpxError is set', async () => {
    vi.resetModules();

    vi.doMock('../stores/MapStore', () => ({
      MapStore: class {
        map = null;
        error = false;
        initMap = vi.fn();
        drawGpxRoute = vi.fn();
        destroy = vi.fn();
      },
    }));
    vi.doMock('../lib/supabase', () => ({ supabase: {} }));
    vi.doMock('../stores/CourseUploadStore', () => ({
      CourseUploadStore: makeMockStore({ gpxError: '유효하지 않은 GPX 파일입니다' }),
    }));

    const { CourseUploadPage } = await import('./CourseUploadPage');
    render(
      <MemoryRouter>
        <CourseUploadPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('유효하지 않은 GPX 파일입니다')).toBeTruthy();
  });
});
