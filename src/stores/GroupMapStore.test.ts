import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupMapStore } from './GroupMapStore';

const { mockSelect, mockUpdate, mockGetUser, mockGetSignedUrl, mockFetch } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetSignedUrl: vi.fn(),
  mockFetch: vi.fn(),
}));

const FAKE_GROUP = {
  id: 'group-1',
  name: '한라산',
  created_by: 'user-1',
  gpx_path: 'user-1/g1.gpx',
  gpx_bucket: 'gpx-files',
  created_at: '2026-01-01T00:00:00Z',
  max_members: null,
  period_started_at: null,
  period_ended_at: null,
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => mockSelect(),
        }),
      }),
      update: (data: unknown) => ({
        eq: () => mockUpdate(data),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: () => mockGetSignedUrl(),
      }),
    },
  },
}));

vi.stubGlobal('fetch', mockFetch);

describe('GroupMapStore', () => {
  let store: GroupMapStore;
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    store = new GroupMapStore(navigate);
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://fake.url/g.gpx' }, error: null });
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<gpx/>') });
  });

  describe('period 상태 초기값', () => {
    it('periodStartedAt이 null', () => {
      expect(store.periodStartedAt).toBeNull();
    });

    it('periodEndedAt이 null', () => {
      expect(store.periodEndedAt).toBeNull();
    });

    it('isPeriodActive가 false', () => {
      expect(store.isPeriodActive).toBe(false);
    });
  });

  describe('load() — period 컬럼 파싱', () => {
    it('period_started_at이 있으면 periodStartedAt Date로 설정', async () => {
      mockSelect.mockResolvedValue({
        data: { ...FAKE_GROUP, period_started_at: '2026-03-22T09:00:00Z' },
        error: null,
      });
      store.load('group-1');
      await vi.waitFor(() => { if (store.group === undefined) throw new Error('not loaded'); });
      expect(store.periodStartedAt).toBeInstanceOf(Date);
    });

    it('period_started_at이 null이면 periodStartedAt null', async () => {
      mockSelect.mockResolvedValue({ data: FAKE_GROUP, error: null });
      store.load('group-1');
      await vi.waitFor(() => { if (store.group === undefined) throw new Error('not loaded'); });
      expect(store.periodStartedAt).toBeNull();
    });

    it('period_started_at있고 period_ended_at없으면 isPeriodActive true', async () => {
      mockSelect.mockResolvedValue({
        data: { ...FAKE_GROUP, period_started_at: '2026-03-22T09:00:00Z', period_ended_at: null },
        error: null,
      });
      store.load('group-1');
      await vi.waitFor(() => { if (store.group === undefined) throw new Error('not loaded'); });
      expect(store.isPeriodActive).toBe(true);
    });
  });

  describe('startPeriod()', () => {
    it('groups UPDATE 호출 (period_started_at=now, period_ended_at=null)', async () => {
      mockUpdate.mockResolvedValue({ error: null });
      mockSelect.mockResolvedValue({ data: FAKE_GROUP, error: null });
      store.load('group-1');
      await vi.waitFor(() => { if (store.group === undefined) throw new Error('not loaded'); });
      await store.startPeriod();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ period_ended_at: null })
      );
    });

    it('성공 후 periodStartedAt이 Date로 설정', async () => {
      mockUpdate.mockResolvedValue({ error: null });
      mockSelect.mockResolvedValue({ data: FAKE_GROUP, error: null });
      store.load('group-1');
      await vi.waitFor(() => { if (store.group === undefined) throw new Error('not loaded'); });
      await store.startPeriod();
      expect(store.periodStartedAt).toBeInstanceOf(Date);
      expect(store.periodEndedAt).toBeNull();
    });
  });

  describe('endPeriod()', () => {
    it('groups UPDATE 호출 (period_ended_at=now)', async () => {
      mockUpdate.mockResolvedValue({ error: null });
      mockSelect.mockResolvedValue({ data: FAKE_GROUP, error: null });
      store.load('group-1');
      await vi.waitFor(() => { if (store.group === undefined) throw new Error('not loaded'); });
      await store.endPeriod();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ period_ended_at: expect.any(String) })
      );
    });

    it('성공 후 isPeriodActive가 false', async () => {
      mockUpdate.mockResolvedValue({ error: null });
      mockSelect.mockResolvedValue({
        data: { ...FAKE_GROUP, period_started_at: '2026-03-22T09:00:00Z' },
        error: null,
      });
      store.load('group-1');
      await vi.waitFor(() => { if (store.group === undefined) throw new Error('not loaded'); });
      await store.endPeriod();
      expect(store.isPeriodActive).toBe(false);
    });
  });
});
