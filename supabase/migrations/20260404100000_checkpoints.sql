-- supabase/migrations/20260404100000_checkpoints.sql

-- ============================================================
-- checkpoints 테이블
-- ============================================================
CREATE TABLE checkpoints (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID              NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name        TEXT              NOT NULL,
  lat         DOUBLE PRECISION  NOT NULL,
  lng         DOUBLE PRECISION  NOT NULL,
  radius_m    INTEGER           NOT NULL DEFAULT 30,
  sort_order  DOUBLE PRECISION  NOT NULL,
  is_finish   BOOLEAN           NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX ON checkpoints (group_id, sort_order);

ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;

-- SELECT: 그룹 멤버
CREATE POLICY "group member can view checkpoints"
  ON checkpoints FOR SELECT
  USING (is_group_member(group_id));

-- INSERT: 그룹 생성자
CREATE POLICY "group owner can insert checkpoints"
  ON checkpoints FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_id AND groups.created_by = auth.uid()
    )
  );

-- UPDATE: 그룹 생성자
CREATE POLICY "group owner can update checkpoints"
  ON checkpoints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_id AND groups.created_by = auth.uid()
    )
  );

-- DELETE: 그룹 생성자
CREATE POLICY "group owner can delete checkpoints"
  ON checkpoints FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_id AND groups.created_by = auth.uid()
    )
  );

-- ============================================================
-- checkpoint_visits 테이블
-- ============================================================
CREATE TABLE checkpoint_visits (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkpoint_id         UUID        NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  tracking_session_id   UUID        NOT NULL REFERENCES tracking_sessions(id) ON DELETE CASCADE,
  visited_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, checkpoint_id, tracking_session_id)
);

ALTER TABLE checkpoint_visits ENABLE ROW LEVEL SECURITY;

-- INSERT: 본인만
CREATE POLICY "user can insert own visits"
  ON checkpoint_visits FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- SELECT: 해당 체크포인트의 그룹 멤버
CREATE POLICY "group member can view visits"
  ON checkpoint_visits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM checkpoints c
      WHERE c.id = checkpoint_id AND is_group_member(c.group_id)
    )
  );
