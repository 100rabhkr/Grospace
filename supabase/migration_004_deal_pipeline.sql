-- Migration: Add deal pipeline columns to outlets
-- Run in Supabase SQL Editor for existing databases

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS deal_stage text DEFAULT 'lead';
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS deal_stage_entered_at timestamptz DEFAULT now();
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS deal_notes text;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS deal_priority text DEFAULT 'medium';

-- Add CHECK constraints (skip if already exist)
DO $$ BEGIN
  ALTER TABLE outlets ADD CONSTRAINT outlets_deal_stage_check
    CHECK (deal_stage IN ('lead', 'site_visit', 'negotiation', 'loi_signed', 'fit_out', 'operational'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE outlets ADD CONSTRAINT outlets_deal_priority_check
    CHECK (deal_priority IN ('low', 'medium', 'high'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add alert_preferences column to organizations if not exists (for notification routing)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS alert_preferences jsonb DEFAULT '{}';

-- Showcase tokens table for shareable public outlet pages
CREATE TABLE IF NOT EXISTS showcase_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  outlet_id uuid REFERENCES outlets(id) NOT NULL,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  title text,
  description text,
  include_financials boolean DEFAULT false,
  is_active boolean DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_showcase_token ON showcase_tokens(token, is_active);
CREATE INDEX IF NOT EXISTS idx_showcase_outlet ON showcase_tokens(outlet_id);

ALTER TABLE showcase_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Org users can manage their showcase tokens" ON showcase_tokens
    FOR ALL USING (
      org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
