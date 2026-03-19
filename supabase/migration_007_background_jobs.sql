-- Migration 007: Background Jobs via pg_cron
-- Prerequisites: Enable pg_cron extension in Supabase Dashboard → Database → Extensions
-- These functions run on a schedule to keep data fresh

-- ============================================
-- 1. PAYMENT STATUS UPDATER (daily)
-- Marks overdue payments automatically
-- ============================================
CREATE OR REPLACE FUNCTION update_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE payment_records
  SET status = 'overdue'
  WHERE status IN ('pending', 'due', 'upcoming')
    AND due_date < CURRENT_DATE;
END;
$$;

-- ============================================
-- 2. AGREEMENT STATUS TRANSITIONS (daily)
-- active → expiring (within 90 days of expiry)
-- expiring → expired (past expiry date)
-- ============================================
CREATE OR REPLACE FUNCTION transition_agreement_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Active agreements expiring within 90 days → 'expiring'
  UPDATE agreements
  SET status = 'expiring'
  WHERE status = 'active'
    AND lease_expiry_date IS NOT NULL
    AND lease_expiry_date <= (CURRENT_DATE + INTERVAL '90 days')
    AND lease_expiry_date > CURRENT_DATE;

  -- Agreements past expiry → 'expired'
  UPDATE agreements
  SET status = 'expired'
  WHERE status IN ('active', 'expiring')
    AND lease_expiry_date IS NOT NULL
    AND lease_expiry_date < CURRENT_DATE;

  -- Update outlet status for expiring leases
  UPDATE outlets o
  SET status = 'up_for_renewal'
  WHERE o.status = 'operational'
    AND EXISTS (
      SELECT 1 FROM agreements a
      WHERE a.outlet_id = o.id
        AND a.status = 'expiring'
    );
END;
$$;

-- ============================================
-- 3. ESCALATION CALCULATOR (daily)
-- Checks if rent escalation is due and updates obligation amounts
-- ============================================
CREATE OR REPLACE FUNCTION calculate_escalations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  new_amount NUMERIC;
BEGIN
  FOR r IN
    SELECT o.id, o.amount, o.type,
           a.id AS agreement_id, a.org_id,
           (a.extracted_data->'rent'->>'escalation_percentage')::numeric AS esc_pct,
           (a.extracted_data->'rent'->>'escalation_frequency_years')::integer AS esc_freq,
           COALESCE(
             (a.extracted_data->'lease_term'->>'rent_commencement_date')::date,
             (a.extracted_data->'lease_term'->>'lease_commencement_date')::date
           ) AS base_date
    FROM obligations o
    JOIN agreements a ON a.id = o.agreement_id
    WHERE o.is_active = true
      AND o.type = 'rent'
      AND a.extracted_data->'rent'->>'escalation_percentage' IS NOT NULL
      AND (a.extracted_data->'rent'->>'escalation_percentage')::numeric > 0
      AND a.extracted_data->'rent'->>'escalation_frequency_years' IS NOT NULL
  LOOP
    -- Check if escalation is due today
    IF r.base_date IS NOT NULL AND r.esc_freq > 0 THEN
      -- Calculate years since base
      DECLARE
        years_elapsed INTEGER := EXTRACT(YEAR FROM age(CURRENT_DATE, r.base_date));
        next_esc_year INTEGER;
      BEGIN
        next_esc_year := (years_elapsed / r.esc_freq) * r.esc_freq + r.esc_freq;
        -- If escalation anniversary is today (within a 1-day window)
        IF r.base_date + (next_esc_year || ' years')::interval BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' THEN
          new_amount := r.amount * (1 + r.esc_pct / 100);
          UPDATE obligations SET amount = new_amount WHERE id = r.id;

          -- Log the escalation
          INSERT INTO activity_log (org_id, entity_type, entity_id, action, details)
          VALUES (r.org_id, 'obligation', r.id::text, 'escalation_applied', jsonb_build_object(
            'old_amount', r.amount,
            'new_amount', new_amount,
            'escalation_pct', r.esc_pct,
            'agreement_id', r.agreement_id
          ));
        END IF;
      END;
    END IF;
  END LOOP;
END;
$$;

-- ============================================
-- SCHEDULE THE JOBS (requires pg_cron extension)
-- Run these AFTER enabling pg_cron in Supabase Dashboard
-- ============================================

-- First, remove any existing schedules to avoid duplicates
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
  'update-overdue-payments', 'transition-agreements', 'calculate-escalations'
);

-- Run payment status updater daily at 1:00 AM IST (19:30 UTC previous day)
SELECT cron.schedule('update-overdue-payments', '30 19 * * *', 'SELECT update_overdue_payments()');

-- Run agreement transitions daily at 1:30 AM IST (20:00 UTC previous day)
SELECT cron.schedule('transition-agreements', '0 20 * * *', 'SELECT transition_agreement_statuses()');

-- Run escalation calculator daily at 2:00 AM IST (20:30 UTC previous day)
SELECT cron.schedule('calculate-escalations', '30 20 * * *', 'SELECT calculate_escalations()');

-- To verify scheduled jobs:
-- SELECT * FROM cron.job;

-- To manually test:
-- SELECT update_overdue_payments();
-- SELECT transition_agreement_statuses();
-- SELECT calculate_escalations();
