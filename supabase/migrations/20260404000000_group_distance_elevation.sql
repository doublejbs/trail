-- Add distance, elevation, difficulty columns to groups
ALTER TABLE groups ADD COLUMN IF NOT EXISTS distance_m DOUBLE PRECISION;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS elevation_gain_m DOUBLE PRECISION;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS difficulty TEXT;
