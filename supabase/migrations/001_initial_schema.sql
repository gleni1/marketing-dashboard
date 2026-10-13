-- Ace Roofing Dashboard - Initial Schema
-- Phase 1: Foundation

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE lead_stage AS ENUM (
  'new',
  'contacted',
  'call_again',
  'booked',
  'no_show',
  'estimate_given',
  'follow_up',
  'sold',
  'lost',
  'junk'
);

CREATE TYPE job_status AS ENUM (
  'scheduled',
  'in_progress',
  'complete',
  'paid'
);

CREATE TYPE spend_source AS ENUM (
  'sync',
  'manual'
);

CREATE TYPE channel_spend_source AS ENUM (
  'synced',
  'manual',
  'none'
);

CREATE TYPE shared_cost_mode AS ENUM (
  'overall_cac_only',
  'split_by_lead_count'
);

CREATE TYPE lead_origin AS ENUM (
  'ghl',
  'manual'
);

-- =============================================================================
-- TABLES
-- =============================================================================

-- Channels: Marketing channels (Google Ads, Meta, etc.)
CREATE TABLE channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  spend_source channel_spend_source NOT NULL DEFAULT 'none',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Services: Service types (Roof replacement, Repair, etc.)
CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lost reasons: Reasons for lost leads
CREATE TABLE lost_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Leads: Lead tracking with stage management
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  origin lead_origin NOT NULL DEFAULT 'manual',
  ghl_contact_id text,
  name text,
  phone text,
  phone_normalized text,
  town text,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  referrer_name text,
  stage lead_stage NOT NULL DEFAULT 'new',
  next_step text,
  lost_reason_id uuid REFERENCES lost_reasons(id) ON DELETE SET NULL,
  notes text,
  edited_fields text[] DEFAULT '{}',
  duplicate_of uuid REFERENCES leads(id) ON DELETE SET NULL
);

-- Lead stage history: Audit trail for stage changes
CREATE TABLE lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage lead_stage,
  to_stage lead_stage NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- Jobs: Sold jobs with revenue/cost
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  sold_date date NOT NULL DEFAULT CURRENT_DATE,
  customer text,
  town text,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  referrer_name text,
  status job_status NOT NULL DEFAULT 'scheduled',
  sold_amount numeric(12, 2),
  job_cost numeric(12, 2),
  gross_profit numeric(12, 2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Spend: Monthly ad spend per channel
CREATE TABLE spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  month date NOT NULL,
  amount numeric(12, 2) NOT NULL DEFAULT 0,
  source spend_source NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, month)
);

-- Shared costs: Software, gas, estimate time costs
CREATE TABLE shared_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  how text,
  month date NOT NULL,
  amount numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Settings: Single row for hourly rate, targets, etc.
CREATE TABLE settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  hourly_rate numeric(10, 2) NOT NULL DEFAULT 75,
  shared_cost_mode shared_cost_mode NOT NULL DEFAULT 'overall_cac_only',
  targets jsonb NOT NULL DEFAULT '{
    "contact_rate": 90,
    "booking_rate": 50,
    "show_rate": 80,
    "estimate_rate": 85,
    "close_rate": 35,
    "junk_pct": 25,
    "marketing_pct": 8,
    "cac": 1200
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_channel_id ON leads(channel_id);
CREATE INDEX idx_leads_stage ON leads(stage);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_phone_normalized ON leads(phone_normalized);
CREATE INDEX idx_leads_ghl_contact_id ON leads(ghl_contact_id);

CREATE INDEX idx_lead_stage_history_lead_id ON lead_stage_history(lead_id);
CREATE INDEX idx_lead_stage_history_changed_at ON lead_stage_history(changed_at);

CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_lead_id ON jobs(lead_id);
CREATE INDEX idx_jobs_sold_date ON jobs(sold_date);
CREATE INDEX idx_jobs_channel_id ON jobs(channel_id);

CREATE INDEX idx_spend_user_id ON spend(user_id);
CREATE INDEX idx_spend_channel_id ON spend(channel_id);
CREATE INDEX idx_spend_month ON spend(month);

CREATE INDEX idx_shared_costs_user_id ON shared_costs(user_id);
CREATE INDEX idx_shared_costs_month ON shared_costs(month);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE lost_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Channels policies
CREATE POLICY "Users can view their own channels"
  ON channels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own channels"
  ON channels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own channels"
  ON channels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own channels"
  ON channels FOR DELETE
  USING (auth.uid() = user_id);

-- Services policies
CREATE POLICY "Users can view their own services"
  ON services FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own services"
  ON services FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own services"
  ON services FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own services"
  ON services FOR DELETE
  USING (auth.uid() = user_id);

-- Lost reasons policies
CREATE POLICY "Users can view their own lost_reasons"
  ON lost_reasons FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own lost_reasons"
  ON lost_reasons FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lost_reasons"
  ON lost_reasons FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lost_reasons"
  ON lost_reasons FOR DELETE
  USING (auth.uid() = user_id);

-- Leads policies
CREATE POLICY "Users can view their own leads"
  ON leads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own leads"
  ON leads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own leads"
  ON leads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own leads"
  ON leads FOR DELETE
  USING (auth.uid() = user_id);

-- Lead stage history policies (read via lead ownership)
CREATE POLICY "Users can view stage history for their leads"
  ON lead_stage_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM leads WHERE leads.id = lead_stage_history.lead_id AND leads.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert stage history for their leads"
  ON lead_stage_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM leads WHERE leads.id = lead_stage_history.lead_id AND leads.user_id = auth.uid()
  ));

-- Jobs policies
CREATE POLICY "Users can view their own jobs"
  ON jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs"
  ON jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs"
  ON jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jobs"
  ON jobs FOR DELETE
  USING (auth.uid() = user_id);

-- Spend policies
CREATE POLICY "Users can view their own spend"
  ON spend FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own spend"
  ON spend FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own spend"
  ON spend FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own spend"
  ON spend FOR DELETE
  USING (auth.uid() = user_id);

-- Shared costs policies
CREATE POLICY "Users can view their own shared_costs"
  ON shared_costs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own shared_costs"
  ON shared_costs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shared_costs"
  ON shared_costs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shared_costs"
  ON shared_costs FOR DELETE
  USING (auth.uid() = user_id);

-- Settings policies
CREATE POLICY "Users can view their own settings"
  ON settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON settings FOR UPDATE
  USING (auth.uid() = user_id);

-- =============================================================================
-- TRIGGERS FOR updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lost_reasons_updated_at
  BEFORE UPDATE ON lost_reasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spend_updated_at
  BEFORE UPDATE ON spend
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shared_costs_updated_at
  BEFORE UPDATE ON shared_costs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
