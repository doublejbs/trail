-- ============================================================
-- IMPORTANT: Before applying this migration, manually create
-- the "course-gpx" Storage bucket in Supabase dashboard:
-- Storage → New Bucket → name: "course-gpx", public: off
-- ============================================================

-- ============================================================
-- 1. courses table
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  tags             TEXT[],
  gpx_path         TEXT NOT NULL,
  distance_m       INT,
  elevation_gain_m INT,
  is_public        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON courses (is_public, created_at DESC);

-- ============================================================
-- 2. course_likes table
-- ============================================================
CREATE TABLE IF NOT EXISTS course_likes (
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, user_id)
);

-- ============================================================
-- 3. course_comments table
-- ============================================================
CREATE TABLE IF NOT EXISTS course_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. RLS: courses
-- ============================================================
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public courses are readable"
  ON courses FOR SELECT
  USING (is_public = true OR created_by = auth.uid());

CREATE POLICY "owner can insert courses"
  ON courses FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "owner can update courses"
  ON courses FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "owner can delete courses"
  ON courses FOR DELETE
  USING (created_by = auth.uid());

-- ============================================================
-- 5. RLS: course_likes
-- ============================================================
ALTER TABLE course_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "likes readable for accessible courses"
  ON course_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND (courses.is_public = true OR courses.created_by = auth.uid())
    )
  );

CREATE POLICY "user can insert own like"
  ON course_likes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user can delete own like"
  ON course_likes FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 6. RLS: course_comments
-- ============================================================
ALTER TABLE course_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments readable for accessible courses"
  ON course_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND (courses.is_public = true OR courses.created_by = auth.uid())
    )
  );

CREATE POLICY "user can insert own comment"
  ON course_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user can delete own comment"
  ON course_comments FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 7. Storage: course-gpx bucket policies
-- Note: create bucket "course-gpx" with public=false in Supabase dashboard first.
-- Then apply these storage policies via Supabase dashboard or SQL editor:
-- ============================================================
-- SELECT: authenticated users can read any object
CREATE POLICY "authenticated users can read course gpx"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'course-gpx'
    AND auth.role() = 'authenticated'
  );

-- INSERT: user can only insert to their own path prefix
CREATE POLICY "user can upload own course gpx"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'course-gpx'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- DELETE: user can only delete their own objects
CREATE POLICY "user can delete own course gpx"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'course-gpx'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
