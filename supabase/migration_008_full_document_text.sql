-- Migration 008: Add full_document_text column to agreements
-- Stores the complete OCR/extracted text from the lease document
-- so that Q&A chatbot queries don't need to re-scan the PDF each time.

ALTER TABLE agreements ADD COLUMN IF NOT EXISTS full_document_text text;

COMMENT ON COLUMN agreements.full_document_text IS 'Full OCR text of the document, saved on confirm-and-activate to avoid re-scanning for Q&A';
