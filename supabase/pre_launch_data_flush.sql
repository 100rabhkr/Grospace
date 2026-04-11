-- ============================================================================
-- PRE-LAUNCH DATA FLUSH
-- ============================================================================
-- WARNING: DESTRUCTIVE. Wipes ALL lease/outlet/event/payment data across ALL
-- organizations. Only run this when you have no real customer data — i.e.
-- during pre-launch testing.
--
-- PRESERVES:
--   - auth.users           (Supabase auth — don't touch)
--   - profiles             (who signed in, their role/org link)
--   - organizations        (the orgs themselves)
--   - signup_requests      (the signup audit trail)
--
-- WIPES EVERYTHING ELSE the app tracks:
--   outlets, agreements, critical_dates, alerts, obligations,
--   payment_records, documents, lease_drafts, rent_schedules,
--   agreement_clauses, outlet_revenue, outlet_contacts, showcase_tokens,
--   extraction_jobs, leasebot_analyses, feedback, event_assignees,
--   document_qa_sessions, activity_log, brands.
--
-- Uses TRUNCATE ... RESTART IDENTITY CASCADE so:
--   * All dependent rows are removed regardless of FK direction
--   * Sequences reset
--   * RLS is bypassed (TRUNCATE ignores RLS)
--
-- How to run:
--   1. Open Supabase SQL Editor for your project
--   2. Paste this entire file
--   3. Click "Run"
--   4. Accept the "destructive query" warning — that's expected
-- ============================================================================

BEGIN;

-- Use TRUNCATE with CASCADE so we don't have to hand-order FK dependencies.
-- Listing every table explicitly keeps the blast radius crystal clear.

TRUNCATE TABLE
    -- Operational data
    payment_records,
    obligations,
    alerts,
    critical_dates,
    event_assignees,
    rent_schedules,
    agreement_clauses,
    documents,
    outlet_revenue,
    outlet_contacts,
    showcase_tokens,
    agreements,
    outlets,
    -- Pre-sign / pipeline
    lease_drafts,
    -- Background jobs + misc
    extraction_jobs,
    leasebot_analyses,
    document_qa_sessions,
    feedback,
    -- Brands (they're org-scoped config, but user said wipe all)
    brands,
    -- Audit trail
    activity_log
RESTART IDENTITY CASCADE;

-- Optional: also clear Supabase Storage buckets used by the app.
-- Storage is NOT wiped by TRUNCATE. If you want to wipe uploaded files too,
-- uncomment the block below. This uses Supabase's storage.objects table.
-- Make sure the bucket names match your project.
--
-- DELETE FROM storage.objects WHERE bucket_id = 'documents';
-- DELETE FROM storage.objects WHERE bucket_id = 'profile-photos';
-- DELETE FROM storage.objects WHERE bucket_id = 'lease-drafts';

COMMIT;

-- ============================================================================
-- Sanity checks — run these after the flush to confirm state
-- ============================================================================
--
-- SELECT 'outlets' AS table, COUNT(*) FROM outlets
-- UNION ALL SELECT 'agreements', COUNT(*) FROM agreements
-- UNION ALL SELECT 'critical_dates', COUNT(*) FROM critical_dates
-- UNION ALL SELECT 'alerts', COUNT(*) FROM alerts
-- UNION ALL SELECT 'obligations', COUNT(*) FROM obligations
-- UNION ALL SELECT 'payment_records', COUNT(*) FROM payment_records
-- UNION ALL SELECT 'documents', COUNT(*) FROM documents
-- UNION ALL SELECT 'lease_drafts', COUNT(*) FROM lease_drafts
-- UNION ALL SELECT 'brands', COUNT(*) FROM brands
-- UNION ALL SELECT 'profiles (should be non-zero)', COUNT(*) FROM profiles
-- UNION ALL SELECT 'organizations (should be non-zero)', COUNT(*) FROM organizations;
