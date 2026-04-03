-- Add custom_notes and custom_clauses columns to agreements table
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS custom_notes text;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS custom_clauses jsonb DEFAULT '[]'::jsonb;
