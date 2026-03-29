-- Structured rent schedule table for time-bound rent entries per agreement
-- Replaces single monthly_rent with year-by-year breakdown

CREATE TABLE IF NOT EXISTS rent_schedules (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id uuid REFERENCES agreements(id) ON DELETE CASCADE NOT NULL,
    org_id uuid REFERENCES organizations(id) NOT NULL,
    period_label text NOT NULL,                    -- e.g. "Year 1", "Year 2-3", "2024-2025"
    period_start date,                             -- start of this rent period
    period_end date,                               -- end of this rent period
    base_rent numeric DEFAULT 0,                   -- monthly base rent
    rent_per_sqft numeric,                         -- rent rate per sqft
    cam_monthly numeric DEFAULT 0,                 -- CAM charges per month
    hvac_monthly numeric DEFAULT 0,                -- HVAC charges per month
    insurance_monthly numeric DEFAULT 0,           -- insurance per month
    taxes_monthly numeric DEFAULT 0,               -- property tax per month
    gst_pct numeric DEFAULT 18,                    -- GST percentage
    revenue_share_pct numeric,                     -- revenue share % (for hybrid/percentage models)
    total_monthly_outflow numeric GENERATED ALWAYS AS (
        base_rent + cam_monthly + hvac_monthly + insurance_monthly + taxes_monthly
    ) STORED,                                      -- auto-calculated total (excl GST)
    total_with_gst numeric GENERATED ALWAYS AS (
        (base_rent + cam_monthly + hvac_monthly + insurance_monthly + taxes_monthly) * (1 + COALESCE(gst_pct, 0) / 100)
    ) STORED,                                      -- auto-calculated total (incl GST)
    is_current boolean DEFAULT false,              -- true if current period
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rent_schedules_agreement ON rent_schedules(agreement_id);
CREATE INDEX idx_rent_schedules_current ON rent_schedules(agreement_id, is_current) WHERE is_current = true;

-- Enable RLS
ALTER TABLE rent_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY rent_schedules_org_policy ON rent_schedules
    USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
