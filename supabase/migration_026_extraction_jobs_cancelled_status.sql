-- Migration 026: allow `cancelled` status on extraction_jobs
-- Widens the CHECK constraint so the cancel endpoint can mark jobs as cancelled
-- (previously only processing/completed/failed were allowed, causing silent
-- no-ops when a user cancelled an in-flight extraction).

ALTER TABLE extraction_jobs DROP CONSTRAINT IF EXISTS extraction_jobs_status_check;
ALTER TABLE extraction_jobs
  ADD CONSTRAINT extraction_jobs_status_check
  CHECK (status IN ('processing', 'completed', 'failed', 'cancelled'));
