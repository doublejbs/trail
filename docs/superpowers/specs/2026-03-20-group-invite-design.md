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

### RLS Policies

| Table | Policy |
|-------|--------|
| `group_invites` | Group owner can SELECT, INSERT, UPDATE |
| `group_members` | Group owner can SELECT all rows; member can SELECT their own row; anyone can INSERT their own row when joining via valid token |

---

## Routes & Pages

### New Routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/invite/:token` | Public | Validate token, join group, redirect to map |
| `/group/:id/settings` | Owner only | Manage invite links, members, max member limit |

### New Pages

**`InvitePage`** (`/invite/:token`)
- Validates the token against `group_invites`.
- If user is not logged in: redirects to `/login?next=/invite/:token`.
- After login, resumes at `/invite/:token` via the `next` query param.
- Checks membership status, member limit, and link activity before inserting into `group_members`.
- On success: navigates to `/group/:id`.

**`GroupSettingsPage`** (`/group/:id/settings`)
- Owner-only page (redirect to `/group/:id` if accessed by non-owner).
- Sections:
  - **Invite Link:** Display current active link (or none), button to generate/copy, button to deactivate.
  - **Members:** List of current members with join date.
  - **Member Limit:** Number input to set `max_members` (empty = no limit).

### Modified Pages

**`GroupMapPage`** (`/group/:id`)
- If current user is the group owner: show settings button (⚙️) linking to `/group/:id/settings`.
- If current user is a member (not owner): hide settings button.

**`GroupPage`** (`/group`)
- Fetch groups where `created_by = me` OR `group_members.user_id = me`.
- Display owned groups and joined groups together, distinguishing with a visual badge (e.g., "소유자" / "멤버").

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
  status: 'idle' | 'loading' | 'joining' | 'full' | 'invalid' | 'already_member' | 'success'
  groupId: string | null

Methods:
  joinByToken(token)   -- validates token, checks capacity, inserts group_members row
```

### Modified Stores

**`GroupStore`**
- `fetchGroups()` extended to return groups where the user is owner OR member.

---

## New TypeScript Types

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
