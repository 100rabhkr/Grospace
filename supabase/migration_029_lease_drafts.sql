-- Dedicated pre-sign draft table so draft lease / LOI review can happen
-- WITHOUT polluting the outlets or agreements tables. Matches the locked
-- flow: "Pipeline → Draft Lease / LOI → Upload → OCR + review → Risk
-- analysis → NO outlet creation".

CREATE TABLE IF NOT EXISTS lease_drafts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title text NOT NULL,
    document_type text,
    document_filename text,
    document_url text,
    document_text text,
    file_hash text,
    extracted_data jsonb DEFAULT '{}'::jsonb,
    risk_flags jsonb DEFAULT '[]'::jsonb,
    extraction_confidence jsonb DEFAULT '{}'::jsonb,
    -- Optional: user may want to link a draft to a pipeline lead outlet
    -- (which is still an outlet with status=pipeline). NOT required.
    linked_outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL,
    status text DEFAULT 'draft' CHECK (status IN ('draft', 'promoted', 'discarded')),
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_drafts_org ON lease_drafts(org_id);
CREATE INDEX IF NOT EXISTS idx_lease_drafts_status ON lease_drafts(org_id, status);

-- RLS: org-scoped
ALTER TABLE lease_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their org's drafts" ON lease_drafts;
CREATE POLICY "Users can view their org's drafts"
    ON lease_drafts FOR SELECT
    TO authenticated
    USING (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
    );

DROP POLICY IF EXISTS "Users can insert drafts for their org" ON lease_drafts;
CREATE POLICY "Users can insert drafts for their org"
    ON lease_drafts FOR INSERT
    TO authenticated
    WITH CHECK (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
    );

DROP POLICY IF EXISTS "Users can update their org's drafts" ON lease_drafts;
CREATE POLICY "Users can update their org's drafts"
    ON lease_drafts FOR UPDATE
    TO authenticated
    USING (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
    );

DROP POLICY IF EXISTS "Users can delete their org's drafts" ON lease_drafts;
CREATE POLICY "Users can delete their org's drafts"
    ON lease_drafts FOR DELETE
    TO authenticated
    USING (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
    );
