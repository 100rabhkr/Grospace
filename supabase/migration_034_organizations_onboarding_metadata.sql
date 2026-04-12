-- Onboarding metadata for organizations. Captured when Super Admin creates
-- a new org via Settings → Platform → Create New Organization so we have
-- full customer context without needing a separate CRM.
--
-- Also widens profiles to carry the admin phone + role_title the Super Admin
-- types into the create form, so the admin's own profile reflects the
-- context they were onboarded with.

-- 1. Organization-level metadata
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_type text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hq_city text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hq_country text DEFAULT 'IN';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS gst_number text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_registration text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS expected_outlets_size text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarded_at timestamptz DEFAULT now();

-- 2. Admin profile metadata added during onboarding
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_title text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number text;
-- phone_number may already exist from an earlier schema; IF NOT EXISTS is a no-op in that case.

CREATE INDEX IF NOT EXISTS idx_organizations_business_type
    ON organizations (business_type) WHERE business_type IS NOT NULL;
