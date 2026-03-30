-- Critical dates engine: auto-calculated deadlines for lease lifecycle
-- Tracks notice periods, escalation dates, option exercise windows, etc.

CREATE TABLE IF NOT EXISTS critical_dates (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id uuid REFERENCES agreements(id) ON DELETE CASCADE NOT NULL,
    org_id uuid REFERENCES organizations(id) NOT NULL,
    outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
    date_type text NOT NULL CHECK (date_type IN (
        'lease_expiry', 'notice_deadline', 'lock_in_end', 'escalation_due',
        'option_exercise', 'renewal_window_open', 'renewal_window_close',
        'security_deposit_refund', 'registration_due', 'fit_out_end',
        'rent_commencement', 'custom'
    )),
    date_value date NOT NULL,
    label text NOT NULL,                          -- human-readable description
    status text DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'acknowledged', 'actioned', 'expired')),
    days_remaining integer,                       -- auto-calculated, updated by cron or on read
    alert_days integer[] DEFAULT '{180,90,60,30,14,7}',  -- days before date to send alerts
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_critical_dates_agreement ON critical_dates(agreement_id);
CREATE INDEX idx_critical_dates_upcoming ON critical_dates(date_value, status) WHERE status = 'upcoming';
CREATE INDEX idx_critical_dates_org ON critical_dates(org_id, date_type);

ALTER TABLE critical_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY critical_dates_org_policy ON critical_dates
    USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
