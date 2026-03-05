-- Migration 005: Add phone_number to profiles, fix RLS gaps
-- Run in Supabase SQL Editor for existing databases

-- Add phone_number column for WhatsApp notifications
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number text;

-- Fix: Allow org_admin to INSERT documents (currently only platform_admin can)
DO $$ BEGIN
  CREATE POLICY "Org admins can insert documents" ON documents
    FOR INSERT WITH CHECK (
      org_id IN (
        SELECT p.org_id FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('org_admin', 'platform_admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fix: Allow org_admin to INSERT obligations (auto-generated from confirm & activate)
DO $$ BEGIN
  CREATE POLICY "Org admins can manage obligations" ON obligations
    FOR ALL USING (
      org_id IN (
        SELECT p.org_id FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('org_admin', 'platform_admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fix: Allow org_admin to INSERT payment_records (generated from obligations)
DO $$ BEGIN
  CREATE POLICY "Org admins can manage payments" ON payment_records
    FOR ALL USING (
      org_id IN (
        SELECT p.org_id FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('org_admin', 'platform_admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fix: Allow org_admin to INSERT alerts (created during confirm & activate, reminders)
DO $$ BEGIN
  CREATE POLICY "Org admins can manage alerts" ON alerts
    FOR ALL USING (
      org_id IN (
        SELECT p.org_id FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('org_admin', 'platform_admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fix: Allow org_admin to INSERT activity_log entries
DO $$ BEGIN
  CREATE POLICY "Org admins can insert activity log" ON activity_log
    FOR INSERT WITH CHECK (
      org_id IN (
        SELECT p.org_id FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('org_admin', 'platform_admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for profiles phone lookup (WhatsApp routing)
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_org ON activity_log(org_id, created_at DESC);
