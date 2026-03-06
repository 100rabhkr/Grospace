-- Migration 006: Add missing indexes for frequently queried columns
-- Run in Supabase SQL Editor for existing databases

CREATE INDEX IF NOT EXISTS idx_obligations_agreement ON obligations(agreement_id);
CREATE INDEX IF NOT EXISTS idx_agreements_outlet ON agreements(outlet_id);
CREATE INDEX IF NOT EXISTS idx_payments_obligation ON payment_records(obligation_id);
CREATE INDEX IF NOT EXISTS idx_alerts_outlet ON alerts(outlet_id);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_agreement ON document_qa_sessions(agreement_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_outlets_deal_stage ON outlets(org_id, deal_stage);
