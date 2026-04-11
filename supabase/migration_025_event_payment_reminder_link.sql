-- migration_025: Link Events → Reminders → Payments
-- Adds source_event_id FK to alerts, obligations, and payment_records
-- so that creating an event auto-creates linked reminders and payments.
-- Also adds notes column to outlets.

-- 1. Link alerts back to their source event
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS source_event_id uuid
    REFERENCES critical_dates(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_alerts_source_event
  ON alerts(source_event_id) WHERE source_event_id IS NOT NULL;

-- 2. Link obligations back to their source event
ALTER TABLE obligations
  ADD COLUMN IF NOT EXISTS source_event_id uuid
    REFERENCES critical_dates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_obligations_source_event
  ON obligations(source_event_id) WHERE source_event_id IS NOT NULL;

-- 3. Link payment_records back to their source event
ALTER TABLE payment_records
  ADD COLUMN IF NOT EXISTS source_event_id uuid
    REFERENCES critical_dates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_records_source_event
  ON payment_records(source_event_id) WHERE source_event_id IS NOT NULL;

-- 4. Backfill is_financial for known financial event types
UPDATE critical_dates
SET is_financial = true
WHERE event_type IN (
  'tds_filing', 'gst_rcm', 'security_deposit_topup',
  'rent_escalation', 'cam_reconciliation'
)
AND is_financial = false;

-- 5. Add notes column to outlets for free-text notes
ALTER TABLE outlets
  ADD COLUMN IF NOT EXISTS notes text;
