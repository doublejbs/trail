# Group Invite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add invite link system so group owners can share their group with other users who get read-only access to the GPX route.

**Architecture:** A `group_invites` table stores invite tokens per group; a `group_members` table stores who joined. Joining is done via a `SECURITY DEFINER` Postgres RPC (`join_group_by_token`) that atomically validates the token and inserts the member. New pages: `InvitePage` (public, handles join flow) and `GroupSettingsPage` (owner-only, manages invites/members/limit).

**Tech Stack:** React 19, TypeScript, MobX, Supabase (PostgreSQL + RLS + Storage), React Router v7, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-20-group-invite-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| **Modify** | `src/types/group.ts` | Add `max_members: number \| null` |
| **Create** | `src/types/invite.ts` | `GroupInvite` and `GroupMember` interfaces |
| **Create** | `supabase/migrations/20260320000000_group_invite.sql` | All DDL: tables, RLS, storage policy, RPC |
| **Modify** | `src/stores/GroupStore.ts` | Fetch owned + member groups; expose `currentUserId` |
| **Modify** | `src/stores/GroupStore.test.ts` | Update mock structure for new query shape |
| **Create** | `src/stores/JoinGroupStore.ts` | Join via invite token (calls RPC) |
| **Create** | `src/stores/JoinGroupStore.test.ts` | Tests for join flow |
| **Create** | `src/stores/GroupInviteStore.ts` | Manage invites, members, max limit |
| **Create** | `src/stores/GroupInviteStore.test.ts` | Tests for invite management |
| **Modify** | `src/pages/LoginPage.tsx` | Forward `?next=` param through OAuth redirect |
| **Modify** | `src/pages/LoginPage.test.tsx` | Test next param forwarding |
| **Create** | `src/pages/InvitePage.tsx` | Public invite landing page |
| **Create** | `src/pages/InvitePage.test.tsx` | Tests for invite join flow |
| **Create** | `src/pages/GroupSettingsPage.tsx` | Owner settings: invites, members, limit |
| **Create** | `src/pages/GroupSettingsPage.test.tsx` | Tests for settings page |
| **Modify** | `src/pages/GroupMapPage.tsx` | Show settings button for owner only |
| **Modify** | `src/pages/GroupMapPage.test.tsx` | Test owner vs member UI |
| **Modify** | `src/pages/GroupPage.tsx` | Show owned + member groups with badges |
| **Modify** | `src/App.tsx` | Register `/invite/:token` (public) and `/group/:id/settings` (protected) |

---

## Task 1: TypeScript Types

**Files:**
- Modify: `src/types/group.ts`
- Create: `src/types/invite.ts`

- [ ] **Step 1: Add `max_members` to Group interface**

Edit `src/types/group.ts`:

```typescript
export interface Group {
  id: string;
  name: string;
  created_by: string;
  gpx_path: string;
  created_at: string;
  max_members: number | null;
}
```

- [ ] **Step 2: Create invite types file**

Create `src/types/invite.ts`:

```typescript
export interface GroupInvite {
  id: string;
  group_id: string;
  token: string;
  is_active: boolean;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no type errors (some may appear in GroupStore.test.ts due to missing `max_members` in fixtures — fix by adding `max_members: null` to all fake group objects in `src/stores/GroupStore.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/types/group.ts src/types/invite.ts
git commit -m "feat: add GroupInvite, GroupMember types; add max_members to Group"
```

> **Note:** `GroupStore.test.ts` will be fully rewritten in Task 3 — don't touch it here.

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260320000000_group_invite.sql`

This SQL must be run in the Supabase dashboard (SQL Editor) or via `supabase db push`. It creates all tables, RLS policies, storage policy, and the join RPC.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260320000000_group_invite.sql`:

```sql
-- ============================================================
-- 1. Add max_members to groups table
-- ============================================================
ALTER TABLE groups ADD COLUMN IF NOT EXISTS max_members INT;

-- ============================================================
-- 2. Create group_invites table
-- ============================================================
CREATE TABLE IF NOT EXISTS group_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Create group_members table
-- ============================================================
CREATE TABLE IF NOT EXISTS group_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- ============================================================
-- 4. RLS: group_invites (owner only)
-- ============================================================
ALTER TABLE group_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage invites"
  ON group_invites
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_invites.group_id
        AND groups.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_invites.group_id
        AND groups.created_by = auth.uid()
    )
  );

-- ============================================================
-- 5. RLS: group_members
-- ============================================================
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Owner can see all members of their groups
CREATE POLICY "owner can view members"
  ON group_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
        AND groups.created_by = auth.uid()
    )
  );

-- Member can see their own membership row
CREATE POLICY "member can view own membership"
  ON group_members
  FOR SELECT
  USING (user_id = auth.uid());

-- No direct INSERT from client — enforced via RPC only

-- ============================================================
-- 6. RLS: groups — add member read access
-- ============================================================
CREATE POLICY "member can view joined groups"
  ON groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
        AND group_members.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. Storage: members can read GPX files
-- ============================================================
CREATE POLICY "members can read gpx files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'gpx-files'
    AND EXISTS (
      SELECT 1 FROM group_members gm
      JOIN groups g ON g.id = gm.group_id
      WHERE gm.user_id = auth.uid()
        AND g.gpx_path = storage.objects.name
    )
  );

-- ============================================================
-- 8. RPC: join_group_by_token (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION join_group_by_token(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite   group_invites;
  v_group    groups;
  v_count    INT;
BEGIN
  -- 1. Validate token
  SELECT * INTO v_invite
  FROM group_invites
  WHERE token = p_token AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'invalid');
  END IF;

  -- 2. Load group
  SELECT * INTO v_group FROM groups WHERE id = v_invite.group_id;

  -- 3. Owner clicking their own link → already_member
  IF v_group.created_by = auth.uid() THEN
    RETURN json_build_object('status', 'already_member', 'group_id', v_group.id);
  END IF;

  -- 4. Already a member?
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = v_group.id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('status', 'already_member', 'group_id', v_group.id);
  END IF;

  -- 5. Acquire advisory lock to prevent race condition
  PERFORM pg_advisory_xact_lock(('x' || md5(v_group.id::text))::bit(64)::bigint);

  -- Re-read group after lock
  SELECT * INTO v_group FROM groups WHERE id = v_invite.group_id;

  -- 6. Capacity check
  IF v_group.max_members IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM group_members WHERE group_id = v_group.id;

    IF v_count >= v_group.max_members THEN
      RETURN json_build_object('status', 'full');
    END IF;
  END IF;

  -- 7. Insert member
  INSERT INTO group_members (group_id, user_id)
  VALUES (v_group.id, auth.uid());

  RETURN json_build_object('status', 'joined', 'group_id', v_group.id);
END;
$$;
```

- [ ] **Step 2: Apply migration to Supabase**

Run the SQL in the Supabase dashboard SQL Editor, or:

```bash
# If using Supabase CLI:
supabase db push
```

- [ ] **Step 3: Verify tables exist**

In Supabase dashboard, confirm:
- Table `group_invites` exists with columns: id, group_id, token, is_active, created_at
- Table `group_members` exists with columns: id, group_id, user_id, joined_at
- Column `max_members` exists on `groups`
- Function `join_group_by_token` exists under Database → Functions

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260320000000_group_invite.sql
git commit -m "feat: add group_invites, group_members tables, RLS, storage policy, join RPC"
```

---

## Task 3: GroupStore — Fetch Owned + Member Groups

The existing RLS `SELECT` policy on `groups` only allows `created_by = auth.uid()`. After Task 2's migration adds a second policy allowing members to also `SELECT`, a plain `select('*')` returns both owned and joined groups. We add `currentUserId` so the UI can distinguish them.

**Files:**
- Modify: `src/stores/GroupStore.ts`
- Modify: `src/stores/GroupStore.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the content of `src/stores/GroupStore.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupStore } from './GroupStore';

const { mockGetUser, mockOrder } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockOrder: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: () => ({
      select: () => ({
        order: (...args: unknown[]) => mockOrder(...args),
      }),
    }),
  },
}));

const FAKE_USER_ID = 'user-abc-123';

const makeGroup = (id: string) => ({
  id,
  name: `Group ${id}`,
  created_by: FAKE_USER_ID,
  gpx_path: `${FAKE_USER_ID}/${id}.gpx`,
  created_at: '2026-01-01T00:00:00Z',
  max_members: null,
});

describe('GroupStore', () => {
  let store: GroupStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: FAKE_USER_ID } }, error: null });
    mockOrder.mockResolvedValue({ data: [], error: null });
    store = new GroupStore();
  });

  describe('초기 상태', () => {
    it('groups가 빈 배열', () => expect(store.groups).toEqual([]));
    it('loading이 true', () => expect(store.loading).toBe(true));
    it('error가 false', () => expect(store.error).toBe(false));
    it('currentUserId가 null', () => expect(store.currentUserId).toBeNull());
  });

  describe('load()', () => {
    it('성공 시 groups 설정 및 loading=false', async () => {
      const fakeGroups = [makeGroup('g1')];
      mockOrder.mockResolvedValue({ data: fakeGroups, error: null });

      await store.load();

      expect(store.groups).toEqual(fakeGroups);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(false);
    });

    it('성공 시 currentUserId 설정', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });
      await store.load();
      expect(store.currentUserId).toBe(FAKE_USER_ID);
    });

    it('DB 오류 시 error=true 및 loading=false', async () => {
      mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });
      await store.load();
      expect(store.error).toBe(true);
      expect(store.loading).toBe(false);
      expect(store.groups).toEqual([]);
    });

    it('두 번째 load() 호출 시 loading=true로 리셋', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });
      await store.load();
      expect(store.loading).toBe(false);

      let loadingDuringFetch: boolean | undefined;
      mockOrder.mockImplementation(() => {
        loadingDuringFetch = store.loading;
        return Promise.resolve({ data: [], error: null });
      });
      await store.load();
      expect(loadingDuringFetch).toBe(true);
    });

    it('created_at 내림차순 정렬로 조회', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });
      await store.load();
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/GroupStore.test.ts
```

Expected: FAIL — `store.currentUserId` doesn't exist yet.

- [ ] **Step 3: Update GroupStore**

Replace `src/stores/GroupStore.ts`:

```typescript
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { Group } from '../types/group';

class GroupStore {
  public groups: Group[] = [];
  public loading: boolean = true;
  public error: boolean = false;
  public currentUserId: string | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public async load(): Promise<void> {
    this.loading = true;
    this.error = false;

    const [{ data: userData }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);

    runInAction(() => {
      if (error) {
        this.error = true;
      } else {
        this.groups = data ?? [];
        this.currentUserId = userData?.user?.id ?? null;
      }
      this.loading = false;
    });
  }
}

export { GroupStore };
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/stores/GroupStore.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/GroupStore.ts src/stores/GroupStore.test.ts
git commit -m "feat: GroupStore exposes currentUserId, fetches owned + member groups"
```

---

## Task 4: JoinGroupStore

**Files:**
- Create: `src/stores/JoinGroupStore.ts`
- Create: `src/stores/JoinGroupStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/stores/JoinGroupStore.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JoinGroupStore } from './JoinGroupStore';

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

describe('JoinGroupStore', () => {
  let store: JoinGroupStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new JoinGroupStore();
  });

  describe('초기 상태', () => {
    it('status가 idle', () => expect(store.status).toBe('idle'));
    it('groupId가 null', () => expect(store.groupId).toBeNull());
  });

  describe('joinByToken()', () => {
    it('joined 응답 시 status=success, groupId 설정', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'joined', group_id: 'g1' }, error: null });
      await store.joinByToken('some-token');
      expect(store.status).toBe('success');
      expect(store.groupId).toBe('g1');
    });

    it('already_member 응답 시 status=already_member, groupId 설정', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'already_member', group_id: 'g1' }, error: null });
      await store.joinByToken('some-token');
      expect(store.status).toBe('already_member');
      expect(store.groupId).toBe('g1');
    });

    it('full 응답 시 status=full', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'full' }, error: null });
      await store.joinByToken('some-token');
      expect(store.status).toBe('full');
      expect(store.groupId).toBeNull();
    });

    it('invalid 응답 시 status=invalid', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'invalid' }, error: null });
      await store.joinByToken('some-token');
      expect(store.status).toBe('invalid');
    });

    it('RPC 오류 시 status=invalid', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'network error' } });
      await store.joinByToken('some-token');
      expect(store.status).toBe('invalid');
    });

    it('올바른 RPC 이름과 토큰으로 호출', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'joined', group_id: 'g1' }, error: null });
      await store.joinByToken('abc-123');
      expect(mockRpc).toHaveBeenCalledWith('join_group_by_token', { p_token: 'abc-123' });
    });

    it('호출 중 status=loading', async () => {
      let statusDuringCall: string | undefined;
      mockRpc.mockImplementation(() => {
        statusDuringCall = store.status;
        return Promise.resolve({ data: { status: 'joined', group_id: 'g1' }, error: null });
      });
      await store.joinByToken('abc-123');
      expect(statusDuringCall).toBe('loading');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/JoinGroupStore.test.ts
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement JoinGroupStore**

Create `src/stores/JoinGroupStore.ts`:

```typescript
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';

type JoinStatus = 'idle' | 'loading' | 'success' | 'already_member' | 'full' | 'invalid';

class JoinGroupStore {
  public status: JoinStatus = 'idle';
  public groupId: string | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public async joinByToken(token: string): Promise<void> {
    this.status = 'loading';
    this.groupId = null;

    const { data, error } = await supabase.rpc('join_group_by_token', { p_token: token });

    runInAction(() => {
      if (error || !data) {
        this.status = 'invalid';
        return;
      }
      this.status = data.status as JoinStatus;
      this.groupId = data.group_id ?? null;
    });
  }
}

export { JoinGroupStore };
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/stores/JoinGroupStore.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/JoinGroupStore.ts src/stores/JoinGroupStore.test.ts
git commit -m "feat: add JoinGroupStore — calls join_group_by_token RPC"
```

---

## Task 5: GroupInviteStore

**Files:**
- Create: `src/stores/GroupInviteStore.ts`
- Create: `src/stores/GroupInviteStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/stores/GroupInviteStore.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupInviteStore } from './GroupInviteStore';

const { mockSelect, mockInsert, mockUpdate, mockUpdateGroups, mockSelectMembers } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateGroups: vi.fn(),
  mockSelectMembers: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'group_members') {
        return {
          select: () => ({
            eq: () => mockSelectMembers(),
          }),
        };
      }
      if (table === 'groups') {
        return {
          update: (...args: unknown[]) => ({
            eq: (...eqArgs: unknown[]) => mockUpdateGroups(...args, ...eqArgs),
          }),
        };
      }
      // group_invites table
      return {
        select: () => ({
          eq: () => ({
            order: (...args: unknown[]) => mockSelect(...args),
          }),
        }),
        insert: (...args: unknown[]) => ({
          select: () => mockInsert(...args),
        }),
        update: (...args: unknown[]) => ({
          eq: (...eqArgs: unknown[]) => mockUpdate(...args, ...eqArgs),
        }),
      };
    },
  },
}));

const FAKE_INVITE = {
  id: 'inv-1',
  group_id: 'g1',
  token: 'tok-abc',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

const FAKE_MEMBER = {
  id: 'mem-1',
  group_id: 'g1',
  user_id: 'u2',
  joined_at: '2026-01-02T00:00:00Z',
};

describe('GroupInviteStore', () => {
  let store: GroupInviteStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue({ data: [], error: null });
    mockSelectMembers.mockResolvedValue({ data: [], error: null });
    mockInsert.mockResolvedValue({ data: [FAKE_INVITE], error: null });
    mockUpdate.mockResolvedValue({ data: null, error: null });
    store = new GroupInviteStore();
  });

  describe('초기 상태', () => {
    it('invites가 빈 배열', () => expect(store.invites).toEqual([]));
    it('members가 빈 배열', () => expect(store.members).toEqual([]));
    it('loading이 false', () => expect(store.loading).toBe(false));
    it('error가 null', () => expect(store.error).toBeNull());
  });

  describe('fetchInvites()', () => {
    it('성공 시 invites 설정', async () => {
      mockSelect.mockResolvedValue({ data: [FAKE_INVITE], error: null });
      await store.fetchInvites('g1');
      expect(store.invites).toEqual([FAKE_INVITE]);
    });

    it('실패 시 error 설정', async () => {
      mockSelect.mockResolvedValue({ data: null, error: { message: 'DB error' } });
      await store.fetchInvites('g1');
      expect(store.error).toBe('DB error');
    });
  });

  describe('fetchMembers()', () => {
    it('성공 시 members 설정', async () => {
      mockSelectMembers.mockResolvedValue({ data: [FAKE_MEMBER], error: null });
      await store.fetchMembers('g1');
      expect(store.members).toEqual([FAKE_MEMBER]);
    });
  });

  describe('createInvite()', () => {
    it('성공 시 invites에 추가', async () => {
      mockInsert.mockResolvedValue({ data: [FAKE_INVITE], error: null });
      await store.createInvite('g1');
      expect(store.invites).toContainEqual(FAKE_INVITE);
    });

    it('실패 시 error 설정', async () => {
      mockInsert.mockResolvedValue({ data: null, error: { message: 'insert error' } });
      await store.createInvite('g1');
      expect(store.error).toBe('insert error');
    });
  });

  describe('deactivateInvite()', () => {
    it('성공 시 해당 invite의 is_active를 false로 업데이트', async () => {
      store.invites = [FAKE_INVITE];
      await store.deactivateInvite('inv-1');
      expect(store.invites[0].is_active).toBe(false);
    });
  });

  describe('updateMaxMembers()', () => {
    it('성공 시 groups 테이블 직접 업데이트', async () => {
      mockUpdateGroups.mockResolvedValue({ error: null });
      await store.updateMaxMembers('g1', 10);
      // mock receives spread args: update({ max_members }) then eq('id', groupId)
      expect(mockUpdateGroups).toHaveBeenCalledWith({ max_members: 10 }, 'id', 'g1');
    });

    it('null로 제한 해제 가능', async () => {
      mockUpdateGroups.mockResolvedValue({ error: null });
      await store.updateMaxMembers('g1', null);
      expect(mockUpdateGroups).toHaveBeenCalledWith({ max_members: null }, 'id', 'g1');
    });
  });
});
```

> **Note:** `updateMaxMembers` uses a simple RPC call. The actual Supabase update on `groups` can also be done directly via `.from('groups').update({ max_members: n }).eq('id', groupId)` — see implementation note in Step 3.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/stores/GroupInviteStore.test.ts
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement GroupInviteStore**

Create `src/stores/GroupInviteStore.ts`:

```typescript
import { makeAutoObservable, runInAction } from 'mobx';
import { supabase } from '../lib/supabase';
import type { GroupInvite, GroupMember } from '../types/invite';

class GroupInviteStore {
  public invites: GroupInvite[] = [];
  public members: GroupMember[] = [];
  public loading: boolean = false;
  public error: string | null = null;

  public constructor() {
    makeAutoObservable(this);
  }

  public async fetchInvites(groupId: string): Promise<void> {
    this.loading = true;
    this.error = null;

    const { data, error } = await supabase
      .from('group_invites')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    runInAction(() => {
      if (error) {
        this.error = error.message;
      } else {
        this.invites = data ?? [];
      }
      this.loading = false;
    });
  }

  public async fetchMembers(groupId: string): Promise<void> {
    const { data, error } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId);

    runInAction(() => {
      if (!error) {
        this.members = data ?? [];
      }
    });
  }

  public async createInvite(groupId: string): Promise<void> {
    this.error = null;

    const { data, error } = await supabase
      .from('group_invites')
      .insert({ group_id: groupId })
      .select();

    runInAction(() => {
      if (error) {
        this.error = error.message;
      } else if (data) {
        this.invites = [...(data as GroupInvite[]), ...this.invites];
      }
    });
  }

  public async deactivateInvite(inviteId: string): Promise<void> {
    this.error = null;

    const { error } = await supabase
      .from('group_invites')
      .update({ is_active: false })
      .eq('id', inviteId);

    runInAction(() => {
      if (!error) {
        this.invites = this.invites.map((inv) =>
          inv.id === inviteId ? { ...inv, is_active: false } : inv
        );
      }
    });
  }

  public async updateMaxMembers(groupId: string, max: number | null): Promise<void> {
    this.error = null;

    const { error } = await supabase
      .from('groups')
      .update({ max_members: max })
      .eq('id', groupId);

    if (error) {
      runInAction(() => { this.error = error.message; });
    }
  }
}

export { GroupInviteStore };
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/stores/GroupInviteStore.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/GroupInviteStore.ts src/stores/GroupInviteStore.test.ts
git commit -m "feat: add GroupInviteStore — fetch/create/deactivate invites, manage members"
```

---

## Task 6: LoginPage — Forward `?next=` Through OAuth

**Files:**
- Modify: `src/pages/LoginPage.tsx`
- Modify: `src/pages/LoginPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/pages/LoginPage.test.tsx` (after the existing tests):

```typescript
describe('next param forwarding', () => {
  const renderWithNext = (next: string) =>
    render(
      <MemoryRouter initialEntries={[`/login?next=${encodeURIComponent(next)}`]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    );

  it('구글 로그인 시 next 파라미터를 redirectTo에 포함', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    renderWithNext('/invite/abc-token');
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      const call = mockSignInWithOAuth.mock.calls[0][0];
      expect(call.options.redirectTo).toContain(
        encodeURIComponent('/invite/abc-token')
      );
    });
  });

  it('next가 없을 때 기본 redirectTo 사용', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    renderLoginPage();
    fireEvent.click(screen.getByRole('button', { name: /구글/i }));
    await waitFor(() => {
      const call = mockSignInWithOAuth.mock.calls[0][0];
      expect(call.options.redirectTo).toBe(
        `${window.location.origin}/auth/callback`
      );
    });
  });
});
```

Also update the existing `vi.mock` in `LoginPage.test.tsx` to forward args (so the test can inspect `redirectTo`). Replace the existing `vi.mock('../lib/supabase', ...)` block with:

```typescript
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
    },
  },
}));
```

The current file has `signInWithOAuth: () => mockSignInWithOAuth()` — change it to `(...args: unknown[]) => mockSignInWithOAuth(...args)` so the options object is passed to the mock for assertion.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/pages/LoginPage.test.tsx
```

Expected: new tests FAIL — `redirectTo` doesn't include `next` yet.

- [ ] **Step 3: Update LoginPage**

In `src/pages/LoginPage.tsx`, add `useSearchParams` import and update `handleLogin`:

```typescript
// Add to imports:
import { Navigate, useSearchParams } from 'react-router-dom';

// Inside component, before handleLogin:
const [searchParams] = useSearchParams();
const next = searchParams.get('next');

// Update handleLogin:
const handleLogin = async (provider: Provider) => {
  setLoadingProvider(provider);
  try {
    const redirectTo = next
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo },
    });
    if (error) throw error;
  } catch {
    toast.error('잠시 후 다시 시도해주세요');
    setLoadingProvider(null);
  }
};
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/pages/LoginPage.test.tsx
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/LoginPage.tsx src/pages/LoginPage.test.tsx
git commit -m "feat: LoginPage forwards ?next= param through OAuth redirectTo"
```

---

## Task 7: InvitePage

**Files:**
- Create: `src/pages/InvitePage.tsx`
- Create: `src/pages/InvitePage.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/pages/InvitePage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { InvitePage } from './InvitePage';

const { mockStore, mockGetSession } = vi.hoisted(() => ({
  mockStore: {
    status: 'idle' as string,
    groupId: null as string | null,
    joinByToken: vi.fn(),
  },
  mockGetSession: vi.fn(),
}));

vi.mock('../stores/JoinGroupStore', () => ({
  JoinGroupStore: vi.fn(function () { return mockStore; }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

const renderInvite = (token = 'test-token') =>
  render(
    <MemoryRouter initialEntries={[`/invite/${token}`]}>
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/group/:id" element={<div>Group Map</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('InvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = 'idle';
    mockStore.groupId = null;
    mockStore.joinByToken.mockResolvedValue(undefined);
  });

  it('비로그인 상태면 /login?next= 으로 리다이렉트', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('로그인 상태면 joinByToken 호출', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockStore.joinByToken.mockImplementation(() => {
      mockStore.status = 'success';
      mockStore.groupId = 'g1';
      return Promise.resolve();
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(mockStore.joinByToken).toHaveBeenCalledWith('abc-123');
    });
  });

  it('success 상태면 /group/:id로 이동', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockStore.joinByToken.mockImplementation(() => {
      mockStore.status = 'success';
      mockStore.groupId = 'g1';
      return Promise.resolve();
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText('Group Map')).toBeInTheDocument();
    });
  });

  it('already_member 상태면 /group/:id로 이동', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockStore.joinByToken.mockImplementation(() => {
      mockStore.status = 'already_member';
      mockStore.groupId = 'g1';
      return Promise.resolve();
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText('Group Map')).toBeInTheDocument();
    });
  });

  it('invalid 상태면 에러 메시지 표시', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockStore.joinByToken.mockImplementation(() => {
      mockStore.status = 'invalid';
      return Promise.resolve();
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText(/유효하지 않은 초대/i)).toBeInTheDocument();
    });
  });

  it('full 상태면 에러 메시지 표시', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockStore.joinByToken.mockImplementation(() => {
      mockStore.status = 'full';
      return Promise.resolve();
    });
    renderInvite('abc-123');
    await waitFor(() => {
      expect(screen.getByText(/가득/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/pages/InvitePage.test.tsx
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement InvitePage**

Create `src/pages/InvitePage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { supabase } from '../lib/supabase';
import { JoinGroupStore } from '../stores/JoinGroupStore';

export const InvitePage = observer(() => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new JoinGroupStore());
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
      setSessionChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!sessionChecked || !isLoggedIn || !token) return;
    store.joinByToken(token);
  }, [sessionChecked, isLoggedIn, token, store]);

  useEffect(() => {
    if (
      (store.status === 'success' || store.status === 'already_member') &&
      store.groupId
    ) {
      navigate(`/group/${store.groupId}`, { replace: true });
    }
  }, [store.status, store.groupId, navigate]);

  if (!sessionChecked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
        replace
      />
    );
  }

  if (store.status === 'loading' || store.status === 'idle') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (store.status === 'invalid') {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <p className="text-sm text-neutral-500">유효하지 않은 초대 링크입니다</p>
      </div>
    );
  }

  if (store.status === 'full') {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <p className="text-sm text-neutral-500">그룹이 가득 찼습니다</p>
      </div>
    );
  }

  return null;
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/pages/InvitePage.test.tsx
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/InvitePage.tsx src/pages/InvitePage.test.tsx
git commit -m "feat: add InvitePage — validates token, joins group, handles edge cases"
```

---

## Task 8: GroupSettingsPage

**Files:**
- Create: `src/pages/GroupSettingsPage.tsx`
- Create: `src/pages/GroupSettingsPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/pages/GroupSettingsPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GroupSettingsPage } from './GroupSettingsPage';

const OWNER_ID = 'owner-user-id';

const { mockInviteStore, mockGetUser, mockGroupSelect } = vi.hoisted(() => ({
  mockInviteStore: {
    invites: [] as { id: string; group_id: string; token: string; is_active: boolean; created_at: string }[],
    members: [] as { id: string; group_id: string; user_id: string; joined_at: string }[],
    loading: false,
    error: null as string | null,
    fetchInvites: vi.fn(),
    fetchMembers: vi.fn(),
    createInvite: vi.fn(),
    deactivateInvite: vi.fn(),
    updateMaxMembers: vi.fn(),
  },
  mockGetUser: vi.fn(),
  mockGroupSelect: vi.fn(),
}));

vi.mock('../stores/GroupInviteStore', () => ({
  GroupInviteStore: vi.fn(function () { return mockInviteStore; }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockGroupSelect(),
        }),
      }),
    }),
  },
}));

const renderSettings = (groupId = 'g1') =>
  render(
    <MemoryRouter initialEntries={[`/group/${groupId}/settings`]}>
      <Routes>
        <Route path="/group/:id/settings" element={<GroupSettingsPage />} />
        <Route path="/group/:id" element={<div>Group Map</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('GroupSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInviteStore.invites = [];
    mockInviteStore.members = [];
    mockInviteStore.loading = false;
    mockInviteStore.error = null;
    mockInviteStore.fetchInvites.mockResolvedValue(undefined);
    mockInviteStore.fetchMembers.mockResolvedValue(undefined);
    mockGetUser.mockResolvedValue({ data: { user: { id: OWNER_ID } }, error: null });
    mockGroupSelect.mockResolvedValue({
      data: { id: 'g1', name: '테스트 그룹', created_by: OWNER_ID, gpx_path: 'p', created_at: '', max_members: null },
      error: null,
    });
  });

  it('소유자가 아닌 경우 /group/:id로 리다이렉트', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Group Map')).toBeInTheDocument();
    });
  });

  it('소유자인 경우 설정 페이지 표시', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText(/초대 링크/i)).toBeInTheDocument();
    });
  });

  it('초대 링크가 없을 때 생성 버튼 표시', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /링크 생성/i })).toBeInTheDocument();
    });
  });

  it('링크 생성 버튼 클릭 시 createInvite 호출', async () => {
    renderSettings();
    await waitFor(() => screen.getByRole('button', { name: /링크 생성/i }));
    fireEvent.click(screen.getByRole('button', { name: /링크 생성/i }));
    await waitFor(() => {
      expect(mockInviteStore.createInvite).toHaveBeenCalledWith('g1');
    });
  });

  it('활성 초대 링크가 있으면 비활성화 버튼 표시', async () => {
    mockInviteStore.invites = [
      { id: 'inv-1', group_id: 'g1', token: 'tok-abc', is_active: true, created_at: '' },
    ];
    renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /비활성화/i })).toBeInTheDocument();
    });
  });

  it('비활성화 버튼 클릭 시 deactivateInvite 호출', async () => {
    mockInviteStore.invites = [
      { id: 'inv-1', group_id: 'g1', token: 'tok-abc', is_active: true, created_at: '' },
    ];
    renderSettings();
    await waitFor(() => screen.getByRole('button', { name: /비활성화/i }));
    fireEvent.click(screen.getByRole('button', { name: /비활성화/i }));
    await waitFor(() => {
      expect(mockInviteStore.deactivateInvite).toHaveBeenCalledWith('inv-1');
    });
  });

  it('멤버 목록 렌더링', async () => {
    mockInviteStore.members = [
      { id: 'm1', group_id: 'g1', user_id: 'u2', joined_at: '2026-01-02T00:00:00Z' },
    ];
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('u2')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/pages/GroupSettingsPage.test.tsx
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement GroupSettingsPage**

Create `src/pages/GroupSettingsPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '../lib/supabase';
import { GroupInviteStore } from '../stores/GroupInviteStore';
import type { Group } from '../types/group';

export const GroupSettingsPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new GroupInviteStore());
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [maxInput, setMaxInput] = useState<string>('');

  useEffect(() => {
    if (!id) return;

    (async () => {
      const [{ data: userData }, { data: groupData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('groups').select('*').eq('id', id).single(),
      ]);

      const userId = userData?.user?.id ?? null;
      setCurrentUserId(userId);
      setGroup(groupData as Group | null ?? null);

      if (groupData && userId === (groupData as Group).created_by) {
        setMaxInput((groupData as Group).max_members?.toString() ?? '');
        store.fetchInvites(id);
        store.fetchMembers(id);
      }
    })();
  }, [id, store]);

  if (group === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (group === null || !id) {
    return <Navigate to="/group" replace />;
  }

  if (currentUserId && currentUserId !== group.created_by) {
    return <Navigate to={`/group/${id}`} replace />;
  }

  const activeInvite = store.invites.find((inv) => inv.is_active);
  const inviteUrl = activeInvite
    ? `${window.location.origin}/invite/${activeInvite.token}`
    : null;

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success('초대 링크가 복사됐습니다');
  };

  const handleSaveMax = async () => {
    const parsed = maxInput === '' ? null : parseInt(maxInput, 10);
    if (maxInput !== '' && (isNaN(parsed!) || parsed! < 1)) {
      toast.error('올바른 숫자를 입력해주세요');
      return;
    }
    await store.updateMaxMembers(id, parsed);
    if (!store.error) toast.success('저장됐습니다');
  };

  // GroupSettingsPage is rendered inside MainLayout (which shows a bottom tab bar).
  // Use `absolute inset-0` to cover the layout chrome — same pattern as GroupMapPage.
  return (
    <div className="absolute inset-0 overflow-y-auto bg-white">
      {/* Header */}
      <div className="flex items-center px-4 py-4 border-b border-neutral-200">
        <button
          onClick={() => navigate(`/group/${id}`)}
          className="text-sm text-neutral-500 mr-3"
        >
          ←
        </button>
        <h1 className="text-base font-semibold">{group.name} 설정</h1>
      </div>

      <div className="px-4 py-6 flex flex-col gap-8">
        {/* Invite Link Section */}
        <section>
          <h2 className="text-sm font-medium text-neutral-700 mb-3">초대 링크</h2>
          {inviteUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-neutral-500 break-all bg-neutral-50 p-2 rounded">
                {inviteUrl}
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCopy} className="flex-1">
                  링크 복사
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="비활성화"
                  onClick={() => store.deactivateInvite(activeInvite!.id)}
                >
                  비활성화
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              aria-label="링크 생성"
              onClick={() => store.createInvite(id)}
            >
              링크 생성
            </Button>
          )}
        </section>

        {/* Max Members Section */}
        <section>
          <h2 className="text-sm font-medium text-neutral-700 mb-3">최대 인원</h2>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min={1}
              placeholder="제한 없음"
              value={maxInput}
              onChange={(e) => setMaxInput(e.target.value)}
              className="border border-neutral-300 rounded px-3 py-1.5 text-sm w-32"
            />
            <Button size="sm" onClick={handleSaveMax}>저장</Button>
          </div>
          <p className="text-xs text-neutral-400 mt-1">비워두면 제한 없음 (소유자 제외)</p>
        </section>

        {/* Members Section */}
        <section>
          <h2 className="text-sm font-medium text-neutral-700 mb-3">
            멤버 ({store.members.length}명)
          </h2>
          {store.members.length === 0 ? (
            <p className="text-sm text-neutral-400">아직 멤버가 없습니다</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {store.members.map((m) => (
                <li key={m.id} className="text-sm text-neutral-700 py-2 border-b border-neutral-100">
                  {m.user_id}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/pages/GroupSettingsPage.test.tsx
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/GroupSettingsPage.tsx src/pages/GroupSettingsPage.test.tsx
git commit -m "feat: add GroupSettingsPage — invite link, member list, max members"
```

---

## Task 9: GroupMapPage — Settings Button for Owner

**Files:**
- Modify: `src/pages/GroupMapPage.tsx`
- Modify: `src/pages/GroupMapPage.test.tsx`

- [ ] **Step 1: Write failing tests**

The existing test file at `src/pages/GroupMapPage.test.tsx` has this mock structure:
- `vi.hoisted`: `{ mockStore, mockNavigate, mockFrom, mockCreateSignedUrl }`
- `vi.mock('../lib/supabase', ...)`: has `from` and `storage` but NO `auth`
- `FAKE_GROUP` has `created_by: 'user-1'`
- `renderAt(path)` helper renders within `MemoryRouter`

Make two targeted changes:

**Change 1:** Add `mockGetUser` to the `vi.hoisted` block (at the end of the existing object):
```typescript
const { mockStore, mockNavigate, mockFrom, mockCreateSignedUrl, mockGetUser } = vi.hoisted(() => ({
  mockStore: { ... },     // unchanged
  mockNavigate: vi.fn(),  // unchanged
  mockFrom: vi.fn(),      // unchanged
  mockCreateSignedUrl: vi.fn(), // unchanged
  mockGetUser: vi.fn(),   // NEW
}));
```

**Change 2:** Add `auth` to the `vi.mock('../lib/supabase', ...)` block:
```typescript
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: {
      from: () => ({
        createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(...args),
      }),
    },
    auth: {                                         // NEW
      getUser: () => mockGetUser(),                 // NEW
    },
  },
}));
```

**Change 3:** Add default `mockGetUser` to `beforeEach` (owner by default):
```typescript
// Add inside existing beforeEach, after the existing mockFrom setup:
mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
```

**Change 4:** Add new test block at the end of the `describe('GroupMapPage')` block:
```typescript
describe('소유자 vs 멤버 UI', () => {
  it('소유자에게 설정 링크 표시 (created_by 일치)', async () => {
    // mockGetUser already returns 'user-1', FAKE_GROUP.created_by = 'user-1'
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /설정/i })).toBeInTheDocument();
    });
  });

  it('멤버에게 설정 링크 숨김 (created_by 불일치)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
    renderAt('/group/group-uuid-1');
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /설정/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```

Expected: new tests FAIL.

- [ ] **Step 3: Update GroupMapPage**

In `src/pages/GroupMapPage.tsx`:

1. Add `getUser` call alongside the existing group fetch:
```typescript
const [currentUserId, setCurrentUserId] = useState<string | null>(null);

// In Effect 1, alongside the group fetch:
const { data: userData } = await supabase.auth.getUser();
setCurrentUserId(userData?.user?.id ?? null);
```

2. Add settings button (visible only to owner) in the return JSX, next to the back button:
```typescript
{currentUserId && group && currentUserId === group.created_by && (
  <div className="absolute top-4 right-4">
    <a
      href={`/group/${id}/settings`}
      aria-label="설정"
      className="bg-white/90 text-black px-3 py-1 rounded-full text-sm font-medium shadow"
    >
      ⚙ 설정
    </a>
  </div>
)}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/pages/GroupMapPage.test.tsx
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/GroupMapPage.tsx src/pages/GroupMapPage.test.tsx
git commit -m "feat: GroupMapPage shows settings button for owner only"
```

---

## Task 10: GroupPage — Show Member Groups with Badge

**Files:**
- Modify: `src/pages/GroupPage.tsx`

- [ ] **Step 1: Write failing test**

Create `src/pages/GroupPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GroupPage } from './GroupPage';

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    groups: [] as { id: string; name: string; created_by: string; gpx_path: string; created_at: string; max_members: null }[],
    loading: false,
    error: false,
    currentUserId: 'owner-id',
    load: vi.fn(),
  },
}));

vi.mock('../stores/GroupStore', () => ({
  GroupStore: vi.fn(function () { return mockStore; }),
}));

const renderGroupPage = () =>
  render(
    <MemoryRouter initialEntries={['/group']}>
      <Routes>
        <Route path="/group" element={<GroupPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('GroupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.loading = false;
    mockStore.error = false;
    mockStore.currentUserId = 'owner-id';
    mockStore.groups = [];
  });

  it('소유자 그룹에 소유자 배지 표시', async () => {
    mockStore.groups = [
      { id: 'g1', name: '내 그룹', created_by: 'owner-id', gpx_path: '', created_at: '', max_members: null },
    ];
    renderGroupPage();
    await waitFor(() => {
      expect(screen.getByText('소유자')).toBeInTheDocument();
    });
  });

  it('멤버 그룹에 멤버 배지 표시', async () => {
    mockStore.groups = [
      { id: 'g2', name: '남의 그룹', created_by: 'other-user', gpx_path: '', created_at: '', max_members: null },
    ];
    renderGroupPage();
    await waitFor(() => {
      expect(screen.getByText('멤버')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/pages/GroupPage.test.tsx
```

Expected: FAIL — no badge rendered yet.

- [ ] **Step 3: Update GroupPage**

The `GroupStore` now exposes `currentUserId`. Compare `group.created_by === store.currentUserId` to determine ownership.

Replace `src/pages/GroupPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Plus } from 'lucide-react';
import { GroupStore } from '../stores/GroupStore';

export const GroupPage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupStore());

  useEffect(() => {
    store.load();
  }, [store]);

  if (store.loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (store.error) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <p className="text-sm text-neutral-400">그룹을 불러올 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto bg-white">
      {store.groups.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <p className="text-sm text-neutral-400">아직 그룹이 없습니다</p>
        </div>
      ) : (
        store.groups.map((group) => {
          const isOwner = store.currentUserId === group.created_by;
          return (
            <button
              key={group.id}
              onClick={() => navigate(`/group/${group.id}`)}
              className="w-full px-4 py-4 text-left text-black border-b border-neutral-200 active:bg-neutral-100 flex items-center justify-between"
            >
              <span>{group.name}</span>
              <span className="text-xs text-neutral-400 ml-2">
                {isOwner ? '소유자' : '멤버'}
              </span>
            </button>
          );
        })
      )}
      <button
        onClick={() => navigate('/group/new')}
        aria-label="그룹 만들기"
        className="absolute right-4 bottom-4 w-12 h-12 bg-black text-white rounded-full flex items-center justify-center shadow-lg active:bg-neutral-800"
      >
        <Plus size={22} />
      </button>
    </div>
  );
});
```

- [ ] **Step 4: Run all GroupPage tests**

```bash
npx vitest run src/pages/GroupPage.test.tsx
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/GroupPage.tsx src/pages/GroupPage.test.tsx
git commit -m "feat: GroupPage shows 소유자/멤버 badge for each group"
```

---

## Task 11: Register New Routes in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update App.tsx**

Replace `src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { MainLayout } from './pages/MainLayout';
import { GroupPage } from './pages/GroupPage';
import { GroupCreatePage } from './pages/GroupCreatePage';
import { GroupMapPage } from './pages/GroupMapPage';
import { GroupSettingsPage } from './pages/GroupSettingsPage';
import { HistoryPage } from './pages/HistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { InvitePage } from './pages/InvitePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/group" replace />} />
          <Route path="group" element={<GroupPage />} />
          <Route path="group/new" element={<GroupCreatePage />} />
          <Route path="group/:id" element={<GroupMapPage />} />
          <Route path="group/:id/settings" element={<GroupSettingsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all PASS

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: register /invite/:token and /group/:id/settings routes"
```

---

## Final Checklist

- [ ] All tests passing: `npx vitest run`
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] DB migration applied to Supabase (Task 2 must be run manually)
- [ ] Manual smoke test:
  1. Create a group as owner
  2. Go to `/group/:id/settings` → generate invite link
  3. Copy link → open in incognito → redirected to login → login → auto-joined → redirected to group map
  4. Group shows "멤버" badge in `/group` list
  5. Settings button not visible for member
  6. Deactivate link → joining again shows error
  7. Set max members → exceed limit → shows "가득 찼습니다"
