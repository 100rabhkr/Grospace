-- GroSpace Database Schema
-- Run this in Supabase SQL Editor to set up all tables
-- Safe to re-run: drops and recreates everything

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- DROP EXISTING (clean slate, safe to re-run)
-- ============================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;

DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS document_qa_sessions CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS payment_records CASCADE;
DROP TABLE IF EXISTS obligations CASCADE;
DROP TABLE IF EXISTS agreements CASCADE;
DROP TABLE IF EXISTS outlets CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- ============================================
-- ORGANIZATIONS (brands)
-- ============================================
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  logo_url text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'org_member' CHECK (role IN ('platform_admin', 'org_admin', 'org_member')),
  org_id uuid REFERENCES organizations(id),
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- OUTLETS
-- ============================================
CREATE TABLE outlets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  name text NOT NULL,
  brand_name text,
  address text,
  city text,
  state text,
  pincode text,
  property_type text CHECK (property_type IN ('mall', 'high_street', 'cloud_kitchen', 'metro', 'transit', 'cyber_park', 'hospital', 'college')),
  floor text,
  unit_number text,
  super_area_sqft numeric,
  covered_area_sqft numeric,
  carpet_area_sqft numeric,
  franchise_model text CHECK (franchise_model IN ('FOFO', 'FOCO', 'COCO', 'direct_lease')),
  status text DEFAULT 'pipeline' CHECK (status IN ('pipeline', 'fit_out', 'operational', 'up_for_renewal', 'renewed', 'closed')),
  operating_hours text,
  monthly_net_revenue numeric,
  revenue_updated_at timestamptz,
  deal_stage text DEFAULT 'lead' CHECK (deal_stage IN ('lead', 'site_visit', 'negotiation', 'loi_signed', 'fit_out', 'operational')),
  deal_stage_entered_at timestamptz DEFAULT now(),
  deal_notes text,
  deal_priority text DEFAULT 'medium' CHECK (deal_priority IN ('low', 'medium', 'high')),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- ============================================
-- AGREEMENTS
-- ============================================
CREATE TABLE agreements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  outlet_id uuid REFERENCES outlets(id) NOT NULL,
  type text NOT NULL CHECK (type IN ('lease_loi', 'license_certificate', 'franchise_agreement')),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'expiring', 'expired', 'renewed', 'terminated')),
  document_url text,
  document_filename text,
  extracted_data jsonb,
  extraction_status text DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'review', 'confirmed', 'failed')),
  extraction_confidence jsonb,
  risk_flags jsonb,
  lessor_name text,
  lessee_name text,
  brand_name text,
  lease_commencement_date date,
  rent_commencement_date date,
  lease_expiry_date date,
  lock_in_end_date date,
  rent_model text CHECK (rent_model IN ('fixed', 'revenue_share', 'hybrid_mglr', 'percentage_only')),
  monthly_rent numeric,
  rent_per_sqft numeric,
  cam_monthly numeric,
  total_monthly_outflow numeric,
  security_deposit numeric,
  late_payment_interest_pct numeric,
  certificate_type text,
  certificate_number text,
  issuing_authority text,
  valid_from date,
  valid_to date,
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id)
);

-- ============================================
-- OBLIGATIONS
-- ============================================
CREATE TABLE obligations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  agreement_id uuid REFERENCES agreements(id) NOT NULL,
  outlet_id uuid REFERENCES outlets(id) NOT NULL,
  type text NOT NULL CHECK (type IN ('rent', 'cam', 'hvac', 'electricity', 'water_gas', 'power_backup', 'revenue_reconciliation', 'security_deposit', 'cam_deposit', 'utility_deposit', 'license_renewal')),
  frequency text NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly', 'one_time')),
  amount numeric,
  amount_formula text,
  due_day_of_month integer,
  start_date date,
  end_date date,
  escalation_pct numeric,
  escalation_frequency_years integer,
  next_escalation_date date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- PAYMENT RECORDS
-- ============================================
CREATE TABLE payment_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  obligation_id uuid REFERENCES obligations(id) NOT NULL,
  outlet_id uuid REFERENCES outlets(id) NOT NULL,
  period_month integer NOT NULL,
  period_year integer NOT NULL,
  due_date date,
  due_amount numeric,
  status text DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'due', 'paid', 'overdue', 'partially_paid')),
  paid_amount numeric,
  paid_at timestamptz,
  marked_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- ALERTS
-- ============================================
CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  outlet_id uuid REFERENCES outlets(id),
  agreement_id uuid REFERENCES agreements(id),
  obligation_id uuid REFERENCES obligations(id),
  type text NOT NULL CHECK (type IN ('rent_due', 'cam_due', 'escalation', 'lease_expiry', 'license_expiry', 'lock_in_expiry', 'renewal_window', 'fit_out_deadline', 'deposit_installment', 'revenue_reconciliation', 'custom')),
  severity text DEFAULT 'medium' CHECK (severity IN ('high', 'medium', 'low', 'info')),
  title text NOT NULL,
  message text,
  trigger_date date NOT NULL,
  lead_days integer,
  reference_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged', 'snoozed', 'escalated')),
  sent_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_at timestamptz,
  snoozed_until date,
  assigned_to uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- DOCUMENTS
-- ============================================
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  agreement_id uuid REFERENCES agreements(id),
  outlet_id uuid REFERENCES outlets(id),
  file_url text NOT NULL,
  filename text,
  file_type text,
  file_size_bytes integer,
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz DEFAULT now()
);

-- ============================================
-- DOCUMENT Q&A HISTORY
-- ============================================
CREATE TABLE document_qa_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agreement_id uuid REFERENCES agreements(id) NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  messages jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- ACTIVITY LOG
-- ============================================
CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  entity_type text,
  entity_id uuid,
  action text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- SHOWCASE TOKENS (shareable public links)
-- ============================================
CREATE TABLE showcase_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid REFERENCES organizations(id) NOT NULL,
  outlet_id uuid REFERENCES outlets(id) NOT NULL,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  title text,
  description text,
  include_financials boolean DEFAULT false,
  is_active boolean DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_obligations_due ON obligations(due_day_of_month, is_active);
CREATE INDEX idx_obligations_org ON obligations(org_id, is_active);
CREATE INDEX idx_obligations_outlet ON obligations(outlet_id, is_active);
CREATE INDEX idx_payments_status ON payment_records(status, due_date);
CREATE INDEX idx_payments_org ON payment_records(org_id, period_year, period_month);
CREATE INDEX idx_alerts_trigger ON alerts(trigger_date, status);
CREATE INDEX idx_alerts_org ON alerts(org_id, status);
CREATE INDEX idx_agreements_expiry ON agreements(lease_expiry_date, status);
CREATE INDEX idx_agreements_org ON agreements(org_id, status);
CREATE INDEX idx_outlets_org ON outlets(org_id, status);
CREATE INDEX idx_outlets_city ON outlets(city, org_id);
CREATE INDEX idx_showcase_token ON showcase_tokens(token, is_active);
CREATE INDEX idx_showcase_outlet ON showcase_tokens(outlet_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_qa_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Platform admins full access to organizations" ON organizations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "Org users can view their organization" ON organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Platform admins full access to outlets" ON outlets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "Org users can view their outlets" ON outlets
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org admins can manage their outlets" ON outlets
  FOR ALL USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND role = 'org_admin')
  );

CREATE POLICY "Platform admins full access to agreements" ON agreements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "Org users can view their agreements" ON agreements
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org admins can manage their agreements" ON agreements
  FOR ALL USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid() AND role = 'org_admin')
  );

CREATE POLICY "Platform admins full access to obligations" ON obligations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "Org users can view their obligations" ON obligations
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Platform admins full access to payments" ON payment_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "Org users can view their payments" ON payment_records
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org users can update their payments" ON payment_records
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Platform admins full access to alerts" ON alerts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "Org users can view their alerts" ON alerts
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org users can update their alerts" ON alerts
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Platform admins full access to documents" ON documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "Org users can view their documents" ON documents
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage own QA sessions" ON document_qa_sessions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Platform admins full access to activity log" ON activity_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "Org users can view their activity log" ON activity_log
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

ALTER TABLE showcase_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can manage their showcase tokens" ON showcase_tokens
  FOR ALL USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================
-- TRIGGER: Auto-create profile on user signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'org_member')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- STORAGE BUCKET for documents
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
