-- Add thumbnail_path column to groups table
ALTER TABLE groups ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;
