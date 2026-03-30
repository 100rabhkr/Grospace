-- Org logo
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;

-- Outlet Storage Drive: pre-defined folders
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder text DEFAULT 'other'
    CHECK (folder IN ('agreements', 'licenses', 'photos', 'electricity_bills', 'layout_plans', 'nocs', 'kyc', 'property_tax', 'sale_deed', 'insurance', 'other'));

-- India-specific compliance fields on agreements
-- Covers: stamp duty, registration, TDS, GST, lock-in, security deposits

-- Add India compliance columns to agreements
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS stamp_duty_amount numeric;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS stamp_duty_paid boolean DEFAULT false;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS stamp_duty_state text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS registration_status text DEFAULT 'not_required'
    CHECK (registration_status IN ('not_required', 'pending', 'submitted', 'registered'));
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS registration_number text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS registration_date date;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS index_ii_document_url text;

-- TDS tracking
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS tds_applicable boolean DEFAULT false;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS tds_rate_pct numeric DEFAULT 10;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS landlord_pan text;

-- GST details
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS gst_applicable boolean DEFAULT true;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS gst_rate_pct numeric DEFAULT 18;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS landlord_gstin text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS tenant_gstin text;

-- Lock-in enhancements
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS lock_in_penalty_months numeric;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS early_exit_penalty_formula text;

-- Security deposit enhancements
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS security_deposit_months numeric;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS security_deposit_interest_bearing boolean DEFAULT false;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS security_deposit_refund_days integer DEFAULT 90;

-- Renewal tracking
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS renewal_status text DEFAULT 'not_started'
    CHECK (renewal_status IN ('not_started', 'option_decision', 'exercise', 'negotiation', 'execution', 'complete', 'not_renewing'));

-- Clauses table for structured clause extraction
CREATE TABLE IF NOT EXISTS agreement_clauses (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id uuid REFERENCES agreements(id) ON DELETE CASCADE NOT NULL,
    org_id uuid REFERENCES organizations(id) NOT NULL,
    category text NOT NULL CHECK (category IN (
        'exclusive_use', 'subletting', 'hvac_maintenance', 'renewal_option',
        'termination', 'fit_out', 'signage', 'operating_hours', 'insurance',
        'assignment', 'force_majeure', 'indemnity', 'tds', 'gst',
        'stamp_duty', 'registration', 'arbitration', 'other'
    )),
    clause_text text NOT NULL,
    summary text,
    page_number integer,
    source_quote text,
    risk_level text DEFAULT 'neutral' CHECK (risk_level IN ('favorable', 'neutral', 'unfavorable', 'critical')),
    responsibility text,  -- 'landlord', 'tenant', 'shared', 'not_specified'
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_clauses_agreement ON agreement_clauses(agreement_id);
CREATE INDEX idx_clauses_category ON agreement_clauses(category);

ALTER TABLE agreement_clauses ENABLE ROW LEVEL SECURITY;
CREATE POLICY clauses_org_policy ON agreement_clauses
    USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
