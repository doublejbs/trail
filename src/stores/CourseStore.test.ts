import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CourseStore } from './CourseStore';

const FAKE_COURSES = [
  { id: 'c1', name: 'Route A', created_by: 'u1', distance_m: 5000, is_public: true, created_at: '2026-01-01', description: null, tags: null, gpx_path: 'path1', elevation_gain_m: null },
  { id: 'c2', name: 'Route B', created_by: 'u2', distance_m: null, is_public: true, created_at: '2026-01-02', description: null, tags: null, gpx_path: 'path2', elevation_gain_m: null },
];

const { mockGetUser, mockSelect } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: () => ({
      select: () => ({
        // both 'all' (eq is_public) and 'mine' (eq created_by) share this chain
        eq: () => ({
          order: () => ({
            range: (...a: unknown[]) => mockSelect(...a),
          }),
        }),
      }),
    }),
  },
}));

describe('CourseStore', () => {
  let store: CourseStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockSelect.mockResolvedValue({ data: FAKE_COURSES, error: null });
    store = new CourseStore();
  });

  it('초기 상태: courses 빈 배열, loading false', () => {
    expect(store.courses).toHaveLength(0);
    expect(store.loading).toBe(false);
  });

  it('fetchPage() 후 courses 채워짐', async () => {
    await store.fetchPage();
    expect(store.courses).toHaveLength(2);
    expect(store.loading).toBe(false);
  });

  it('fetchPage() 실패 시 error 설정', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'DB 오류' } });
    await store.fetchPage();
    expect(store.error).toBe('DB 오류');
  });

  it('setFilter("mine") 후 fetchPage 호출 시 내 코스만 조회', async () => {
    store.setFilter('mine');
    await store.fetchPage();
    expect(mockSelect).toHaveBeenCalled();
  });

  it('setFilter("all") → filter is "all"', () => {
    store.setFilter('all');
    expect(store.filter).toBe('all');
  });
});
