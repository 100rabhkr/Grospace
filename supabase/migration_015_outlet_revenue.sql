-- Migration 015: Outlet Revenue Table
-- Tracks monthly dine-in and delivery revenue per outlet for rent-to-revenue analysis.

CREATE TABLE IF NOT EXISTS outlet_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid REFERENCES outlets(id) NOT NULL,
  org_id uuid REFERENCES organizations(id) NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year int NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  dine_in_revenue numeric(12,2),
  delivery_revenue numeric(12,2),
  total_revenue numeric(12,2),
  source text DEFAULT 'manual' CHECK (source IN ('manual', 'csv', 'pos_api')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(outlet_id, month, year)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_outlet_revenue_outlet_id ON outlet_revenue(outlet_id);
CREATE INDEX IF NOT EXISTS idx_outlet_revenue_year_month ON outlet_revenue(year, month);
CREATE INDEX IF NOT EXISTS idx_outlet_revenue_org_id ON outlet_revenue(org_id);

-- Enable RLS
ALTER TABLE outlet_revenue ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their org revenue"
  ON outlet_revenue FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

CREATE POLICY "Users can insert their org revenue"
  ON outlet_revenue FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );

CREATE POLICY "Users can update their org revenue"
  ON outlet_revenue FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin'
    )
  );
