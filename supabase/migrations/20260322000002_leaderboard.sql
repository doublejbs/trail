-- ============================================================
-- profiles 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "user can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "authenticated users can view profiles"
  ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- groups 테이블 — 활동 기간 컬럼 추가
-- ============================================================
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS period_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_ended_at   TIMESTAMPTZ;

-- ============================================================
-- tracking_sessions 테이블 — 경로 진행 거리 컬럼 추가
-- ============================================================
ALTER TABLE tracking_sessions
  ADD COLUMN IF NOT EXISTS max_route_meters NUMERIC(10,2);
