-- Persist the full signup form metadata so the admin approval panel
-- has the context (city, num_outlets, industry, requested role) the
-- user provided. Previously handle_new_user() only kept full_name,
-- company and phone — everything else was silently dropped.

-- 1. Widen signup_requests to carry the extra fields.
ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS num_outlets text;
ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS requested_role text;

-- 2. Rewrite the trigger so every field the signup form collects is
--    persisted. raw_user_meta_data is whatever we passed in
--    supabase.auth.signUp({ options: { data: {...} } }).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Profile row (org_id NULL until admin approves)
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'org_member')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Signup request for admin approval with full metadata
  INSERT INTO public.signup_requests (
    user_id, name, company, phone, email,
    city, num_outlets, industry, requested_role, status
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'company', ''),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    new.email,
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'num_outlets',
    new.raw_user_meta_data->>'industry',
    COALESCE(new.raw_user_meta_data->>'role', 'org_member'),
    'pending'
  )
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
