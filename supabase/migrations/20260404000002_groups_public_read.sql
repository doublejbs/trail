-- 그룹 목록을 모든 인증 유저에게 공개
DROP POLICY IF EXISTS "member can view joined groups" ON groups;

CREATE POLICY "authenticated can view all groups"
  ON groups
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- group_members SELECT도 모든 인증 유저에게 공개 (멤버 수/아바타 표시용)
CREATE POLICY "authenticated can view all members"
  ON group_members
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
