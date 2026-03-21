// src/stores/CourseUploadStore.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CourseUploadStore } from './CourseUploadStore';

const FAKE_UID = 'user-111';
const FAKE_COURSE_ID = 'course-uuid-222';

const { mockGetUser, mockUpload, mockInsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpload: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    storage: { from: () => ({ upload: (...a: unknown[]) => mockUpload(...a) }) },
    from: () => ({ insert: (...a: unknown[]) => mockInsert(...a) }),
  },
}));

// parseGpxCoords returns valid coords for any input in these tests
vi.mock('../lib/gpx', () => ({
  parseGpxCoords: vi.fn().mockReturnValue([
    { lat: 37.5, lon: 127.0, ele: 10 },
    { lat: 37.501, lon: 127.001, ele: 20 },
  ]),
  computeDistanceM: vi.fn().mockReturnValue(150),
  computeElevationGainM: vi.fn().mockReturnValue(10),
}));

describe('CourseUploadStore', () => {
  let store: CourseUploadStore;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => FAKE_COURSE_ID });
    mockGetUser.mockResolvedValue({ data: { user: { id: FAKE_UID } }, error: null });
    mockUpload.mockResolvedValue({ data: {}, error: null });
    mockInsert.mockResolvedValue({ data: {}, error: null });
    store = new CourseUploadStore();
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('초기 상태', () => {
    it('name 빈 문자열', () => expect(store.name).toBe(''));
    it('file null', () => expect(store.file).toBeNull());
    it('gpxError null', () => expect(store.gpxError).toBeNull());
    it('submitting false', () => expect(store.submitting).toBe(false));
  });

  describe('isValid', () => {
    it('name과 file 모두 없으면 false', () => expect(store.isValid).toBe(false));

    it('name 없으면 false', async () => {
      await store.setFile(new File(['gpx'], 'r.gpx'));
      expect(store.isValid).toBe(false);
    });

    it('file 없으면 false', () => {
      store.setName('Route');
      expect(store.isValid).toBe(false);
    });

    it('gpxError 있으면 false', async () => {
      store.setName('Route');
      await store.setFile(new File(['bad'], 'r.gpx'));
      store.gpxError = 'invalid GPX';
      expect(store.isValid).toBe(false);
    });

    it('name + valid file = true', async () => {
      store.setName('Route');
      await store.setFile(new File(['gpx'], 'r.gpx'));
      expect(store.isValid).toBe(true);
    });
  });

  describe('submit()', () => {
    beforeEach(async () => {
      store.setName('My Route');
      await store.setFile(new File(['gpx content'], 'route.gpx'));
    });

    it('성공 시 courseId 반환', async () => {
      const result = await store.submit();
      expect(result).toBe(FAKE_COURSE_ID);
    });

    it('올바른 path로 Storage 업로드', async () => {
      await store.submit();
      expect(mockUpload).toHaveBeenCalledWith(
        `${FAKE_UID}/${FAKE_COURSE_ID}.gpx`,
        expect.any(File),
      );
    });

    it('올바른 값으로 courses 행 삽입', async () => {
      store.setDescription('Nice route');
      store.addTag('쉬움');
      await store.submit();
      expect(mockInsert).toHaveBeenCalledWith({
        id: FAKE_COURSE_ID,
        created_by: FAKE_UID,
        name: 'My Route',
        description: 'Nice route',
        tags: ['쉬움'],
        gpx_path: `${FAKE_UID}/${FAKE_COURSE_ID}.gpx`,
        distance_m: 150,
        elevation_gain_m: 10,
        is_public: true,
      });
    });

    it('업로드 실패 시 null 반환', async () => {
      mockUpload.mockResolvedValue({ error: { message: '업로드 실패' } });
      expect(await store.submit()).toBeNull();
      expect(store.error).toBe('업로드 실패');
    });

    it('성공 후 submitting=false', async () => {
      await store.submit();
      expect(store.submitting).toBe(false);
    });
  });
});
