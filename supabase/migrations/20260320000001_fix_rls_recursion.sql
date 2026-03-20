-- Fix infinite recursion in groups RLS.
--
-- Root cause:
--   groups SELECT  → "member can view joined groups" checks group_members
--   group_members SELECT → "owner can view members" checks groups
--   groups SELECT  → ... infinite loop
--
-- Fix: replace the groups subquery in "owner can view members" with a
-- SECURITY DEFINER function that bypasses RLS, breaking the cycle.

-- 1. Helper function: runs as owner (bypasses RLS), safe because it only
--    returns true when auth.uid() is actually the group creator.
CREATE OR REPLACE FUNCTION is_group_owner(gid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM groups
    WHERE id = gid AND created_by = auth.uid()
  );
$$;

-- 2. Recreate the policy that caused the cycle.
DROP POLICY IF EXISTS "owner can view members" ON group_members;

CREATE POLICY "owner can view members"
  ON group_members
  FOR SELECT
  USING (is_group_owner(group_id));
