-- Add thumbnail_path column to courses table
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;
