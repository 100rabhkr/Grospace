-- Add city and num_outlets fields to signup_requests
-- These fields were added to the signup form

ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS num_outlets integer;

-- Update the trigger to also capture city and num_outlets from user metadata
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
  INSERT INTO public.signup_requests (user_id, name, company, phone, email, city, num_outlets, status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'company', ''),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    new.email,
    COALESCE(new.raw_user_meta_data->>'city', ''),
    (new.raw_user_meta_data->>'num_outlets')::integer,
    'pending'
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
