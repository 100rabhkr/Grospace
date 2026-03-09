-- Fix: Auto-create signup_request when a new user signs up
-- This ensures new signups appear in the admin approval panel

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Create profile (existing behavior)
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'org_member')
  );

  -- Also create a signup request for admin approval
  INSERT INTO public.signup_requests (user_id, name, company, phone, email, status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'company', ''),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    new.email,
    'pending'
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
