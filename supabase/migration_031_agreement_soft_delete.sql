-- Agreement soft-delete + extraction job soft-delete
-- Mirrors migration_022 (outlets) so agreements and extraction jobs can
-- be sent to the recycle bin, restored, or permanently deleted with an
-- audit trail mirrored to Google Sheets.

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_agreements_deleted_at
  ON agreements (deleted_at) WHERE deleted_at IS NOT NULL;

-- Extraction jobs: soft-delete so the user can retire failed/cancelled
-- jobs from the processing page without losing the audit trail.
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_deleted_at
  ON extraction_jobs (deleted_at) WHERE deleted_at IS NOT NULL;
