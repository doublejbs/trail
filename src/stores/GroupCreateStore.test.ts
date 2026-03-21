import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroupCreateStore } from './GroupCreateStore';

const { mockGetUser, mockUpload, mockInsert } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpload: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
      }),
    },
    from: () => ({
      insert: (...args: unknown[]) => mockInsert(...args),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const FAKE_USER_ID = 'user-abc-123';
const FAKE_GROUP_ID = 'group-uuid-456';

describe('GroupCreateStore', () => {
  let store: GroupCreateStore;
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => FAKE_GROUP_ID });
    mockGetUser.mockResolvedValue({ data: { user: { id: FAKE_USER_ID } }, error: null });
    mockUpload.mockResolvedValue({ data: {}, error: null });
    mockInsert.mockResolvedValue({ data: {}, error: null });
    store = new GroupCreateStore(mockNavigate);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('초기 상태', () => {
    it('name이 빈 문자열', () => expect(store.name).toBe(''));
    it('file이 null', () => expect(store.file).toBeNull());
    it('submitting이 false', () => expect(store.submitting).toBe(false));
    it('error가 null', () => expect(store.error).toBeNull());
  });

  describe('isValid', () => {
    it('name이 비어있으면 false', () => {
      store.setFile(new File([''], 'test.gpx'));
      expect(store.isValid).toBe(false);
    });

    it('file이 null이면 false', () => {
      store.setName('My Group');
      expect(store.isValid).toBe(false);
    });

    it('name과 file 모두 있으면 true', () => {
      store.setName('My Group');
      store.setFile(new File([''], 'test.gpx'));
      expect(store.isValid).toBe(true);
    });

    it('name이 공백만 있으면 false', () => {
      store.setName('   ');
      store.setFile(new File([''], 'test.gpx'));
      expect(store.isValid).toBe(false);
    });
  });

  describe('submit()', () => {
    beforeEach(() => {
      store.setName('테스트 그룹');
      store.setFile(new File(['gpx content'], 'route.gpx'));
    });

    it('성공 시 navigate("/group") 호출', async () => {
      await store.submit();
      expect(mockNavigate).toHaveBeenCalledWith('/group');
    });

    it('올바른 경로로 파일 업로드', async () => {
      await store.submit();
      expect(mockUpload).toHaveBeenCalledWith(
        `${FAKE_USER_ID}/${FAKE_GROUP_ID}.gpx`,
        expect.any(File),
      );
    });

    it('올바른 값으로 groups 행 삽입', async () => {
      await store.submit();
      expect(mockInsert).toHaveBeenCalledWith({
        id: FAKE_GROUP_ID,
        name: '테스트 그룹',
        created_by: FAKE_USER_ID,
        gpx_path: `${FAKE_USER_ID}/${FAKE_GROUP_ID}.gpx`,
      });
    });

    it('성공 후 submitting=false', async () => {
      await store.submit();
      expect(store.submitting).toBe(false);
    });

    it('getUser 실패 시 navigate 미호출 + error 설정 + submitting=false', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: '인증 오류' } });
      await store.submit();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(store.error).toBeTruthy();
      expect(store.submitting).toBe(false);
    });

    it('업로드 실패 시 navigate 미호출 + error 메시지 설정 + submitting=false', async () => {
      mockUpload.mockResolvedValue({ data: null, error: { message: '업로드 실패' } });
      await store.submit();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(store.error).toBe('업로드 실패');
      expect(store.submitting).toBe(false);
    });

    it('DB 삽입 실패 시 navigate 미호출 + error 메시지 설정 + submitting=false', async () => {
      mockInsert.mockResolvedValue({ data: null, error: { message: 'DB 오류' } });
      await store.submit();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(store.error).toBe('DB 오류');
      expect(store.submitting).toBe(false);
    });
  });
});
