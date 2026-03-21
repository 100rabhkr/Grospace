-- Migration 016: Extraction Jobs + Obligations source column
-- Supports async bulk upload processing and manual vs extracted obligation tracking.

-- Extraction jobs table for async document processing
CREATE TABLE IF NOT EXISTS extraction_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  filename text,
  status text DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_org_id ON extraction_jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status ON extraction_jobs(status);

-- Add source column to obligations for manual vs extracted tracking
ALTER TABLE obligations ADD COLUMN IF NOT EXISTS source text DEFAULT 'extracted';
ALTER TABLE obligations ADD COLUMN IF NOT EXISTS custom_label text;
