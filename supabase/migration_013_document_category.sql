-- Add category column to documents table for Document Storage feature
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category text DEFAULT 'other';
