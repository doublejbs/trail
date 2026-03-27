-- Allow users to update their own tracking sessions (pause/resume/stop)
CREATE POLICY "user can update own sessions"
  ON tracking_sessions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
