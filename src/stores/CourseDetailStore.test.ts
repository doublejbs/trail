import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CourseDetailStore } from './CourseDetailStore';

const FAKE_COURSE = {
  id: 'c1', name: 'Route', created_by: 'u1',
  distance_m: 5000, elevation_gain_m: 100, is_public: true, created_at: '2026-01-01',
  description: null, tags: null, gpx_path: 'u1/c1.gpx',
};

const {
  mockGetUser,
  mockCourseSingle,
  mockLikeCount,
  mockMyLikeSingle,
  mockComments,
  mockInsert,
  mockDelete,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCourseSingle: vi.fn(),
  mockLikeCount: vi.fn(),
  mockMyLikeSingle: vi.fn(),
  mockComments: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => {
      if (table === 'courses') {
        return {
          select: () => ({ eq: () => ({ single: () => mockCourseSingle() }) }),
        };
      }
      if (table === 'course_likes') {
        return {
          // count query: select('*', { count: 'exact', head: true }).eq(...)
          select: (_col: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.count === 'exact') {
              return { eq: () => mockLikeCount() };
            }
            // userHasLiked query: select('user_id').eq().eq().single()
            return { eq: () => ({ eq: () => ({ single: () => mockMyLikeSingle() }) }) };
          },
          insert: (...a: unknown[]) => mockInsert(...a),
          delete: () => ({ eq: () => ({ eq: () => mockDelete() }) }),
        };
      }
      if (table === 'course_comments') {
        return {
          select: () => ({ eq: () => ({ order: () => mockComments() }) }),
          insert: () => ({ select: () => ({ single: () => mockInsert() }) }),
        };
      }
      return {};
    },
  },
}));

describe('CourseDetailStore', () => {
  let store: CourseDetailStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    mockCourseSingle.mockResolvedValue({ data: FAKE_COURSE, error: null });
    mockLikeCount.mockResolvedValue({ count: 3, error: null });
    mockMyLikeSingle.mockResolvedValue({ data: null, error: null });
    mockComments.mockResolvedValue({ data: [], error: null });
    store = new CourseDetailStore('c1');
  });

  it('초기 상태', () => {
    expect(store.course).toBeNull();
    expect(store.loading).toBe(true);
    expect(store.notFound).toBe(false);
  });

  it('fetch() 후 course 설정', async () => {
    await store.fetch();
    expect(store.course?.id).toBe('c1');
    expect(store.notFound).toBe(false);
  });

  it('fetch() 후 likeCount 설정', async () => {
    await store.fetch();
    expect(store.likeCount).toBe(3);
  });

  it('course가 없으면 notFound=true', async () => {
    mockCourseSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    await store.fetch();
    expect(store.notFound).toBe(true);
  });
});
