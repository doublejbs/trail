-- RPC: 초대 토큰으로 그룹 미리보기 정보 조회 (SECURITY DEFINER로 RLS 우회)
CREATE OR REPLACE FUNCTION preview_invite(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite   group_invites;
  v_group    groups;
  v_count    INT;
  v_is_member BOOLEAN;
BEGIN
  -- 1. 토큰 검증
  SELECT * INTO v_invite
  FROM group_invites
  WHERE token = p_token AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'invalid');
  END IF;

  -- 2. 그룹 조회
  SELECT * INTO v_group FROM groups WHERE id = v_invite.group_id;

  -- 3. 멤버 수
  SELECT COUNT(*) INTO v_count
  FROM group_members WHERE group_id = v_group.id;

  -- 4. 이미 멤버인지 확인
  v_is_member := EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = v_group.id AND user_id = auth.uid()
  ) OR v_group.created_by = auth.uid();

  -- 5. 정원 초과
  IF NOT v_is_member AND v_group.max_members IS NOT NULL AND v_count >= v_group.max_members THEN
    RETURN json_build_object('status', 'full');
  END IF;

  RETURN json_build_object(
    'status', CASE WHEN v_is_member THEN 'already_member' ELSE 'ok' END,
    'group_id', v_group.id,
    'group_name', v_group.name,
    'thumbnail_path', v_group.thumbnail_path,
    'gpx_bucket', v_group.gpx_bucket,
    'member_count', v_count,
    'max_members', v_group.max_members
  );
END;
$$;
