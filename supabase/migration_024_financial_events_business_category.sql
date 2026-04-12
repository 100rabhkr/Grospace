-- Add is_financial flag to critical_dates for financial vs non-financial event filtering
ALTER TABLE critical_dates ADD COLUMN IF NOT EXISTS is_financial boolean DEFAULT false;

-- Auto-set is_financial for known financial event types
UPDATE critical_dates SET is_financial = true
WHERE event_type IN ('tds_filing', 'gst_rcm', 'security_deposit_topup', 'rent_escalation', 'cam_reconciliation');

-- Add business_category to outlets
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS business_category text;
-- Values: dine_in, retail, cloud_kitchen, mall, qsr, cafe, co_working, other

-- Add company_name to outlets for company-level grouping (separate from brand)
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS company_name text;