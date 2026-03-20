-- Leasebot: public-facing lease analysis tool
-- Stores analysis results with token-based access for unauthenticated users

CREATE TABLE IF NOT EXISTS leasebot_analyses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token           text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    document_type   text,
    extraction      jsonb,
    risk_flags      jsonb,
    health_score    int CHECK (health_score >= 0 AND health_score <= 100),
    document_text   text,
    email           text,
    company         text,
    user_id         uuid REFERENCES auth.users(id),
    agreement_id    uuid REFERENCES agreements(id),
    converted_at    timestamptz,
    ip_address      text,
    created_at      timestamptz DEFAULT now(),
    expires_at      timestamptz DEFAULT now() + interval '30 days'
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_leasebot_analyses_token ON leasebot_analyses (token);
CREATE INDEX IF NOT EXISTS idx_leasebot_analyses_email ON leasebot_analyses (email);

-- Enable Row Level Security
ALTER TABLE leasebot_analyses ENABLE ROW LEVEL SECURITY;
