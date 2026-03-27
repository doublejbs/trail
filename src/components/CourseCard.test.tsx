import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CourseCard } from './CourseCard';
import type { Course } from '../types/course';

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
      }),
    },
  },
}));

const COURSE: Course = {
  id: 'c1',
  created_by: 'u1',
  name: 'Bukhansan Trail',
  description: null,
  tags: ['어려움'],
  gpx_path: 'u1/c1.gpx',
  thumbnail_path: null,
  distance_m: 8500,
  elevation_gain_m: 450,
  is_public: true,
  created_at: '2026-01-01T00:00:00Z',
};

const COURSE_NULL_DIST: Course = { ...COURSE, distance_m: null };

// Stub Intersection Observer
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(cb: IntersectionObserverCallback) {
      // immediately call with not-intersecting — thumbnail stays in placeholder
      void cb([], this as unknown as IntersectionObserver);
    }
  });
});

describe('CourseCard', () => {
  it('renders course name', () => {
    render(<CourseCard course={COURSE} likeCount={3} onClick={() => {}} />);
    expect(screen.getByText('Bukhansan Trail')).toBeTruthy();
  });

  it('renders formatted distance', () => {
    render(<CourseCard course={COURSE} likeCount={0} onClick={() => {}} />);
    expect(screen.getByText(/8\.5\s*km/i)).toBeTruthy();
  });

  it('renders — when distance_m is null', () => {
    render(<CourseCard course={COURSE_NULL_DIST} likeCount={0} onClick={() => {}} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders like count', () => {
    render(<CourseCard course={COURSE} likeCount={7} onClick={() => {}} />);
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('renders grey placeholder SVG initially (before intersection)', () => {
    const { container } = render(<CourseCard course={COURSE} likeCount={0} onClick={() => {}} />);
    // The placeholder rect should be present before GPX is fetched
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
  });

  it('renders grey placeholder when GPX fetch fails', async () => {
    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(cb: IntersectionObserverCallback) {
        // fire with isIntersecting: true so the fetch is triggered
        void cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
    });
    const { container } = render(<CourseCard course={COURSE} likeCount={0} onClick={() => {}} />);
    // Wait for the async observer callback to complete
    await new Promise((r) => setTimeout(r, 0));
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
  });
});
