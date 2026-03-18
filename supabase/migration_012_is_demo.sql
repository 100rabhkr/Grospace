-- Add is_demo flag to track seeded/demo data separately from real data
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE agreements ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE obligations ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
