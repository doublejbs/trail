CREATE TABLE group_member_positions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

ALTER TABLE group_member_positions ENABLE ROW LEVEL SECURITY;

-- 그룹 멤버는 같은 그룹의 위치를 읽을 수 있음
CREATE POLICY "group_member_positions_select"
ON group_member_positions FOR SELECT
TO authenticated
USING (true);

-- 자신의 위치만 upsert 가능
CREATE POLICY "group_member_positions_upsert"
ON group_member_positions FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
