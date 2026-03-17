import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthStore } from './AuthStore';

const { mockGetSession, mockOnAuthStateChange, mockSignOut, mockExchangeCodeForSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockSignOut: vi.fn(),
  mockExchangeCodeForSession: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: unknown) => mockOnAuthStateChange(cb),
      signOut: () => mockSignOut(),
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
    },
  },
}));

const mockUnsubscribe = vi.fn();

describe('AuthStore', () => {
  let store: AuthStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    store = new AuthStore();
  });

  describe('initial state', () => {
    it('user is null initially', () => {
      expect(store.user).toBeNull();
    });

    it('loading is true initially', () => {
      expect(store.loading).toBe(true);
    });
  });

  describe('initialize()', () => {
    it('sets user from session after getSession resolves', async () => {
      const fakeUser = { id: 'user-1' };
      mockGetSession.mockResolvedValue({ data: { session: { user: fakeUser } } });
      store.initialize();
      await vi.waitFor(() => expect(store.user).toEqual(fakeUser));
    });

    it('sets loading=false after getSession resolves', async () => {
      store.initialize();
      await vi.waitFor(() => expect(store.loading).toBe(false));
    });

    it('sets user=null when no session', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      store.initialize();
      await vi.waitFor(() => expect(store.loading).toBe(false));
      expect(store.user).toBeNull();
    });

    it('subscribes to onAuthStateChange', () => {
      store.initialize();
      expect(mockOnAuthStateChange).toHaveBeenCalledOnce();
    });

    it('updates user when auth state changes', async () => {
      const fakeUser = { id: 'user-2' };
      let capturedCb: ((event: string, session: unknown) => void) | null = null;
      mockOnAuthStateChange.mockImplementation((cb) => {
        capturedCb = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      });
      store.initialize();
      capturedCb!('SIGNED_IN', { user: fakeUser });
      expect(store.user).toEqual(fakeUser);
    });

    it('returns unsubscribe function', () => {
      const cleanup = store.initialize();
      cleanup();
      expect(mockUnsubscribe).toHaveBeenCalledOnce();
    });
  });

  describe('signOut()', () => {
    it('calls supabase.auth.signOut', async () => {
      mockSignOut.mockResolvedValue({});
      await store.signOut();
      expect(mockSignOut).toHaveBeenCalledOnce();
    });
  });

  describe('exchangeCode()', () => {
    it('returns true on success', async () => {
      const fakeUser = { id: 'user-3' };
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: { user: fakeUser } }, error: null });
      const result = await store.exchangeCode('valid-code');
      expect(result).toBe(true);
    });

    it('sets user on success', async () => {
      const fakeUser = { id: 'user-3' };
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: { user: fakeUser } }, error: null });
      await store.exchangeCode('valid-code');
      expect(store.user).toEqual(fakeUser);
    });

    it('returns false on error', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: 'invalid' } });
      const result = await store.exchangeCode('bad-code');
      expect(result).toBe(false);
    });

    it('returns false when no error but session is null', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });
      const result = await store.exchangeCode('code');
      expect(result).toBe(false);
    });

    it('does not call exchangeCodeForSession a second time (StrictMode guard)', async () => {
      const fakeUser = { id: 'user-3' };
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: { user: fakeUser } }, error: null });
      await store.exchangeCode('code');
      await store.exchangeCode('code');
      expect(mockExchangeCodeForSession).toHaveBeenCalledOnce();
    });

    it('second call returns false immediately without calling supabase', async () => {
      const fakeUser = { id: 'user-3' };
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: { user: fakeUser } }, error: null });
      await store.exchangeCode('code');
      const result = await store.exchangeCode('code');
      expect(result).toBe(false);
      expect(mockExchangeCodeForSession).toHaveBeenCalledOnce();
    });
  });
});
