-- Add status and started_at columns to tracking_sessions
ALTER TABLE tracking_sessions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';

ALTER TABLE tracking_sessions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Index for quickly finding active sessions per user+group
CREATE INDEX IF NOT EXISTS tracking_sessions_active_idx
  ON tracking_sessions (user_id, group_id, status)
  WHERE status IN ('active', 'paused');
