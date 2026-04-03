-- Add file_hash column for duplicate document detection
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS file_hash text;

-- Index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_agreements_file_hash ON agreements (file_hash) WHERE file_hash IS NOT NULL;
