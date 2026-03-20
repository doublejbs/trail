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

CREATE POLICY "owner can select invites"
  ON group_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_invites.group_id
        AND groups.created_by = auth.uid()
    )
  );

CREATE POLICY "owner can insert invites"
  ON group_invites
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_invites.group_id
        AND groups.created_by = auth.uid()
    )
  );

CREATE POLICY "owner can update invites"
  ON group_invites
  FOR UPDATE
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
