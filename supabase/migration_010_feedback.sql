-- Migration 010: Feedback table for extraction error reporting (Task 45)
-- Allows users to flag and correct extraction errors

CREATE TABLE IF NOT EXISTS feedback (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    agreement_id uuid REFERENCES agreements(id),
    org_id uuid REFERENCES organizations(id),
    user_id uuid REFERENCES auth.users(id),
    field_name text NOT NULL,
    original_value text,
    corrected_value text,
    comment text,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'applied', 'rejected')),
    created_at timestamptz DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create feedback for own org" ON feedback
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users can view feedback for own org" ON feedback
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    );
