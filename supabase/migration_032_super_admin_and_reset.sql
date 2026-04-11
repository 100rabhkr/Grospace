-- Super Admin + per-org activity + forced password reset on first login.
-- Ships alongside the code changes that add:
--   * Hardcoded super admin (admin@grospace.com) bootstrapped on startup
--   * Org creation flow where Super Admin types an org + admin email
--   * Invitation emails with generated temp password
--   * Force-reset-on-first-login flag per profile
--   * Per-org Google Sheets activity tab

-- 1. Profiles: force-password-reset flag.
--    Set to true whenever we create a user with a generated password
--    (super admin bootstrap, new org admin, invited member). Cleared when
--    the user successfully changes their password via the reset flow.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_reset_password boolean DEFAULT false;

-- 2. Organizations: remember the display name + sheet tab name so we don't
--    recompute the "BrandName (xxxx)" string on every activity write.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sheet_tab_name text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_admin_email text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_admin_user_id uuid;

-- 3. Signup requests: no longer the primary path after Super Admin is live,
--    but keep the table. Backfill a "super_admin_created" status for audit.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'signup_requests' AND column_name = 'status') THEN
        -- Widen check constraint if one exists to allow the new status.
        BEGIN
            ALTER TABLE signup_requests DROP CONSTRAINT IF EXISTS signup_requests_status_check;
            ALTER TABLE signup_requests
                ADD CONSTRAINT signup_requests_status_check
                CHECK (status IN ('pending', 'approved', 'rejected', 'super_admin_created'));
        EXCEPTION WHEN undefined_object THEN
            -- No existing constraint — nothing to do.
            NULL;
        END;
    END IF;
END $$;

-- 4. Index on must_reset_password so the login flow can quickly check it.
CREATE INDEX IF NOT EXISTS idx_profiles_must_reset_password
    ON profiles (must_reset_password)
    WHERE must_reset_password = true;
