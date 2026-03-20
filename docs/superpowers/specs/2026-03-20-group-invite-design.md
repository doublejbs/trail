# Group Invite Feature Design

**Date:** 2026-03-20
**Status:** Approved

---

## Overview

Add an invite link system so group owners can share their group with other users. Invited members get read-only access to the group's GPX route. Owners manage invite links and member limits from a dedicated settings page.

---

## Requirements

- Group owners can generate a shareable invite link per group.
- Invited members can view the group's GPX route (read-only).
- Non-members who click the link are redirected to login/signup, then auto-joined after authentication.
- Invite links are permanent but can be deactivated by the owner at any time.
- Group owners can set a maximum member count from the group settings page.
- Group settings page is separate from the map view (`/group/:id/settings`).
- Members see a simplified map UI (no settings button); owners see full UI.

---

## Database

### New Tables

```sql
-- Invite links (separate table for extensibility)
group_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Group members
group_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);
```

### Modified Table

```sql
-- Add max_members to existing groups table (NULL = no limit)
ALTER TABLE groups ADD COLUMN max_members INT;
```

**Semantics:** `max_members` counts invited members only (rows in `group_members`). The group owner is not stored in `group_members` and does not count against this limit. For example, `max_members = 5` allows 5 invited members in addition to the owner.

### RLS Policies

| Table | Policy |
|-------|--------|
| `group_invites` | Group owner can SELECT, INSERT, UPDATE. No DELETE — deactivation is always a soft-delete (`is_active = false`); tokens are never hard-deleted. |
| `group_members` | Group owner can SELECT all rows; member can SELECT their own row. INSERT is **not** allowed directly from the client — joining is done exclusively via the `join_group_by_token` RPC (see below). |
| `groups` (modified) | Existing policy allows SELECT for `created_by = auth.uid()`. **Add** a second SELECT policy that allows any user who has a row in `group_members` for that group to SELECT it: `EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())`. |

### Storage Policies (`gpx-files` bucket, modified)

The existing storage policy allows only the file owner to create signed URLs. Add a policy allowing group members to create signed URLs for GPX files belonging to groups they are a member of:

```sql
-- Allow member to create signed URL for a group's GPX file
-- Storage path format: {owner_user_id}/{group_id}.gpx
-- Policy: allow if auth.uid() has a row in group_members for that group_id
CREATE POLICY "members can read gpx files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'gpx-files'
  AND EXISTS (
    SELECT 1 FROM group_members gm
    JOIN groups g ON g.id = gm.group_id
    WHERE gm.user_id = auth.uid()
      AND g.gpx_path = storage.objects.name
  )
);
```

### Server-Side RPC: `join_group_by_token`

Token validation, capacity check, and member insertion are performed atomically in a single Postgres function to prevent race conditions (e.g., two users joining simultaneously when one slot remains).

```sql
-- Pseudo-signature
create function join_group_by_token(p_token uuid)
returns json  -- { group_id, status: 'joined' | 'already_member' | 'invalid' | 'full' }
language plpgsql security definer as $$
declare
  v_invite   group_invites;
  v_group    groups;
  v_count    int;
begin
  -- 1. Validate token
  select * into v_invite from group_invites where token = p_token and is_active = true;
  if not found then return json_build_object('status', 'invalid'); end if;

  -- 2. Owner clicking their own link → treat as already_member
  select * into v_group from groups where id = v_invite.group_id;
  if v_group.created_by = auth.uid() then
    return json_build_object('status', 'already_member', 'group_id', v_group.id);
  end if;

  -- 3. Already a member?
  if exists (select 1 from group_members where group_id = v_invite.group_id and user_id = auth.uid()) then
    return json_build_object('status', 'already_member', 'group_id', v_group.id);
  end if;

  -- 4. Check capacity (advisory lock prevents concurrent joins for the same group)
  -- max_members counts invited members only (owner is not in group_members)
  perform pg_advisory_xact_lock(('x' || md5(v_group.id::text))::bit(64)::bigint);
  select * into v_group from groups where id = v_invite.group_id;
  if v_group.max_members is not null then
    select count(*) into v_count from group_members where group_id = v_group.id;
    if v_count >= v_group.max_members then
      return json_build_object('status', 'full');
    end if;
  end if;

  -- 5. Insert member
  insert into group_members (group_id, user_id) values (v_group.id, auth.uid());
  return json_build_object('status', 'joined', 'group_id', v_group.id);
end;
$$;
```

Called from the client as: `supabase.rpc('join_group_by_token', { p_token: token })`

---

## Routes & Pages

### New Routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/invite/:token` | Public | Validate token, join group, redirect to map |
| `/group/:id/settings` | Owner only | Manage invite links, members, max member limit |

**`App.tsx` changes required:**
- `/invite/:token` must be registered as a **top-level public route**, as a sibling to `/login` and `/auth/callback`, outside the `ProtectedRoute` wrapper. It must not be nested under `ProtectedRoute` since unauthenticated users need to reach it before being redirected to login.
- `/group/:id/settings` must be added inside the existing `ProtectedRoute` group, alongside the existing `/group/:id` route.

### New Pages

**`InvitePage`** (`/invite/:token`)
- If user is not logged in: redirects to `/login?next=/invite/:token`.
- After login, resumes at `/invite/:token` via the `next` query param.
- Calls `JoinGroupStore.joinByToken(token)`, which invokes the `join_group_by_token` RPC. All validation (token validity, capacity, duplicate membership) happens atomically server-side.
- On success: navigates to `/group/:id`.

**`GroupSettingsPage`** (`/group/:id/settings`)
- Owner-only page (redirect to `/group/:id` if accessed by non-owner). The client-side redirect is a UX guard; the underlying RLS policies on `group_invites` (owner-only SELECT/INSERT/UPDATE) enforce this at the database level, so non-owners cannot perform settings operations even if they bypass the redirect.
- Sections:
  - **Invite Link:** Display current active link (or none), button to generate/copy, button to deactivate.
  - **Members:** List of current members with join date.
  - **Member Limit:** Number input to set `max_members` (empty = no limit).

### Modified Pages

**`GroupMapPage`** (`/group/:id`)
- Ownership is determined by comparing `group.created_by` against the current user's ID from `AuthStore` (or equivalent auth hook).
- If current user is the group owner: show settings button (⚙️) linking to `/group/:id/settings`.
- If current user is a member (not owner): hide settings button.

**`GroupPage`** (`/group`)
- Fetch groups where `created_by = me` OR `group_members.user_id = me`.
- Display owned groups and joined groups together, distinguishing with a visual badge (e.g., "소유자" / "멤버").

**`LoginPage`** (`/login`)
- Read `?next=` from the current URL's search params using `useSearchParams`.
- When `next` is present, append it URL-encoded to the Supabase `redirectTo` URL:
  ```
  redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
  ```
- Supabase preserves extra query params on the callback URL. The existing `AuthCallbackPage` already reads `next` from its search params and navigates there after session exchange — this change ensures the param survives the OAuth round-trip.
- Note: this is a required code change to `LoginPage.tsx`, not yet implemented.

---

## State Management

### New Stores

**`GroupInviteStore`**
```
Fields:
  invites: GroupInvite[]
  members: GroupMember[]
  maxMembers: number | null
  loading: boolean
  error: string | null

Methods:
  fetchInvites(groupId)
  fetchMembers(groupId)
  createInvite(groupId)
  deactivateInvite(inviteId)
  updateMaxMembers(groupId, n: number | null)
```

**`JoinGroupStore`**
```
Fields:
  status: 'idle' | 'loading' | 'full' | 'invalid' | 'already_member' | 'success'
  groupId: string | null

Methods:
  joinByToken(token)   -- calls join_group_by_token RPC; sets status and groupId from response
```

### Modified Stores

**`GroupStore`**
- `fetchGroups()` extended to return groups where the user is owner OR member.

---

## TypeScript Types

### New Types

```typescript
export interface GroupInvite {
  id: string;
  group_id: string;
  token: string;        // Only readable by group owner via RLS
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

### Modified Types

```typescript
// src/types/group.ts — add max_members field
export interface Group {
  id: string;
  name: string;
  created_by: string;
  gpx_path: string;
  created_at: string;
  max_members: number | null;   // NEW — null means no limit
}
```

---

## User Flows

### Share Invite Link (Owner)

1. Owner opens `/group/:id/settings`.
2. Clicks "초대 링크 생성" → new row inserted into `group_invites`.
3. Link (`trail.app/invite/{token}`) is shown and can be copied to clipboard.
4. Owner can deactivate the link → `is_active = false`.

### Join via Link (New User)

1. User clicks invite link → `/invite/:token`.
2. Not logged in → redirected to `/login?next=/invite/:token`.
3. Login completes → redirected back to `/invite/:token`.
4. Token validated, member count checked, row inserted into `group_members`.
5. Redirected to `/group/:id`.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User is already a member | Skip insert, redirect to `/group/:id` |
| Link is deactivated | Show "유효하지 않은 초대 링크입니다" |
| Group is at capacity | Show "그룹이 가득 찼습니다" |
| Token does not exist | Show "유효하지 않은 초대 링크입니다" |
| Owner clicks their own invite link | Redirect to `/group/:id` |

---

## Out of Scope

- Email-based invites (planned with friend system)
- Member roles beyond owner/member
- Multiple active invite links per group
- Invite expiry dates
