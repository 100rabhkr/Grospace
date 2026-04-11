-- Bulletproof handle_new_user trigger that never blocks
-- auth.users INSERT regardless of metadata content.
-- Replace handle_new_user with a bulletproof version that does NOT cast
-- any raw_user_meta_data value, avoids ON CONFLICT on missing unique
-- constraints, and never raises if the metadata is missing fields.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- profiles: 1 row per auth user, keyed on id
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
      new.id,
      new.email,
      COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      COALESCE(new.raw_user_meta_data->>'role', 'org_member')
    );
  EXCEPTION WHEN unique_violation THEN
    -- Profile already exists (retry / manual bootstrap) — fine
    NULL;
  WHEN OTHERS THEN
    -- Any other error: don't block auth user creation
    NULL;
  END;

  -- signup_requests: audit row for admin review
  BEGIN
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
    );
  EXCEPTION WHEN OTHERS THEN
    -- Signup request failure must never block auth user creation
    NULL;
  END;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
