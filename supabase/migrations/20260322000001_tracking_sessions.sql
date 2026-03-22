-- ============================================================
-- tracking_sessions 테이블
-- ============================================================
CREATE TABLE tracking_sessions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id        UUID          NOT NULL REFERENCES groups(id)     ON DELETE CASCADE,
  elapsed_seconds INT           NOT NULL,
  distance_meters NUMERIC(10,2) NOT NULL,
  points          JSONB         NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- 리더보드 쿼리용 인덱스
CREATE INDEX ON tracking_sessions (group_id, user_id);

-- RLS 활성화
ALTER TABLE tracking_sessions ENABLE ROW LEVEL SECURITY;

-- INSERT: 자신의 기록만 삽입
CREATE POLICY "user can insert own sessions"
  ON tracking_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- SELECT용 SECURITY DEFINER 함수 (RLS 재귀 방지)
-- group_members → tracking_sessions 서브쿼리가 group_members RLS를 재귀 호출하는 것을 막음
CREATE OR REPLACE FUNCTION is_group_member(gid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid AND user_id = auth.uid()
  );
$$;

-- SELECT: 같은 그룹 멤버의 기록 조회 가능
CREATE POLICY "group member can view sessions"
  ON tracking_sessions FOR SELECT
  USING (is_group_member(group_id));
