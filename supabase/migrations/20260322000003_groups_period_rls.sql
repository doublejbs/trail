-- groups 테이블에 소유자 UPDATE 정책 추가
-- period_started_at / period_ended_at 저장을 위해 필요

CREATE POLICY "owner can update group"
  ON groups
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- tracking_sessions SELECT 정책 수정
-- 그룹 생성자는 group_members에 없을 수 있으므로 owner 조건 추가

DROP POLICY IF EXISTS "group member can view sessions" ON tracking_sessions;

CREATE POLICY "group member can view sessions"
  ON tracking_sessions FOR SELECT
  USING (
    is_group_member(group_id)
    OR EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_id
        AND groups.created_by = auth.uid()
    )
  );
