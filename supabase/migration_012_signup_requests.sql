-- Lead-capture signup requests table
-- Users sign up but don't get org access until admin approves

CREATE TABLE IF NOT EXISTS signup_requests (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    company text,
    phone text,
    email text NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz DEFAULT now(),
    reviewed_at timestamptz,
    reviewed_by uuid
);

-- RLS policies
ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all signup requests"
    ON signup_requests FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Anyone can insert signup requests"
    ON signup_requests FOR INSERT
    TO authenticated
    WITH CHECK (true);
