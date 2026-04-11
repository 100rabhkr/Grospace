-- Licenses workspace: when a user uploads a document with category='license'
-- they should also be able to record the expiry date (drives the auto-reminder
-- created by POST /api/outlets/{id}/documents) and an optional license number
-- for the changelog.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS license_number text;

CREATE INDEX IF NOT EXISTS idx_documents_category_expiry
  ON documents (category, expiry_date)
  WHERE category = 'license';
