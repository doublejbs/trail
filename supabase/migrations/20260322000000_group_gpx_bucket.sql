-- groups 테이블에 gpx_bucket 컬럼 추가
-- 기존 행은 'gpx-files' 버킷을 사용하므로 DEFAULT로 처리
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS gpx_bucket TEXT NOT NULL DEFAULT 'gpx-files';
