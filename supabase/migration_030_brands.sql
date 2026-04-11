-- Brands as a first-class entity. Matches the locked flow:
--   "Login / Signup → Create Organization → Add Brand(s) → Add Team & Roles → Dashboard"
--
-- Additive design:
--   * New `brands` table is org-scoped.
--   * outlets.brand_name + agreements.brand_name remain as denormalized
--     text columns (fast filters, backwards compatible with existing data).
--   * New outlets.brand_id FK is optional — the outlet edit UI picks
--     a brand from the curated list; on pick we copy the brand name into
--     outlets.brand_name so existing reports/filters keep working.

CREATE TABLE IF NOT EXISTS brands (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    logo_url text,
    notes text,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_brands_org ON brands(org_id);

-- Optional FK from outlets/agreements to brands for new rows.
ALTER TABLE outlets    ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;

-- RLS: org-scoped
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org's brands" ON brands;
CREATE POLICY "Users can view their org's brands"
    ON brands FOR SELECT
    TO authenticated
    USING (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
    );

DROP POLICY IF EXISTS "Users can insert brands for their org" ON brands;
CREATE POLICY "Users can insert brands for their org"
    ON brands FOR INSERT
    TO authenticated
    WITH CHECK (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
    );

DROP POLICY IF EXISTS "Users can update their org's brands" ON brands;
CREATE POLICY "Users can update their org's brands"
    ON brands FOR UPDATE
    TO authenticated
    USING (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
    );

DROP POLICY IF EXISTS "Users can delete their org's brands" ON brands;
CREATE POLICY "Users can delete their org's brands"
    ON brands FOR DELETE
    TO authenticated
    USING (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
    );
