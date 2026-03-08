-- Migration 008: Site codes for outlets + document text caching for Q&A
-- Feature 1: Unique property/site codes (e.g., "DelRG-01")
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS site_code text;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS locality text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_outlets_site_code_org ON outlets(org_id, site_code) WHERE site_code IS NOT NULL;

-- Feature 2: Cache extracted text so Q&A doesn't re-run Vision API
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS document_text text;
