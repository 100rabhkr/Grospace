-- Add soft-delete columns to outlets
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- Index for finding deleted outlets
CREATE INDEX IF NOT EXISTS idx_outlets_deleted_at ON outlets (deleted_at) WHERE deleted_at IS NOT NULL;

-- Outlet profile photo
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS profile_photo_url text;

-- Extraction jobs: seen flag for notification dismissal
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS seen boolean DEFAULT false;
