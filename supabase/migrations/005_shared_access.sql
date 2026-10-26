-- =============================================================================
-- SHARED ACCESS: Allow both authorized users to access all data
-- =============================================================================

-- Create a function to check if current user is authorized
CREATE OR REPLACE FUNCTION is_authorized_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.uid() IN (
    'c6728fc5-96f1-4bb7-b0c9-b16f06dfb67c'::uuid,  -- acenjroofing@gmail.com
    'cf4b36bb-5d7a-4e22-a1a9-e1d55122fd85'::uuid   -- glenipoleshi@gmail.com
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- DROP ALL EXISTING POLICIES
-- =============================================================================

-- Channels
DROP POLICY IF EXISTS "Users can view their own channels" ON channels;
DROP POLICY IF EXISTS "Users can insert their own channels" ON channels;
DROP POLICY IF EXISTS "Users can update their own channels" ON channels;
DROP POLICY IF EXISTS "Users can delete their own channels" ON channels;

-- Services
DROP POLICY IF EXISTS "Users can view their own services" ON services;
DROP POLICY IF EXISTS "Users can insert their own services" ON services;
DROP POLICY IF EXISTS "Users can update their own services" ON services;
DROP POLICY IF EXISTS "Users can delete their own services" ON services;

-- Lost reasons
DROP POLICY IF EXISTS "Users can view their own lost_reasons" ON lost_reasons;
DROP POLICY IF EXISTS "Users can insert their own lost_reasons" ON lost_reasons;
DROP POLICY IF EXISTS "Users can update their own lost_reasons" ON lost_reasons;
DROP POLICY IF EXISTS "Users can delete their own lost_reasons" ON lost_reasons;

-- Leads
DROP POLICY IF EXISTS "Users can view their own leads" ON leads;
DROP POLICY IF EXISTS "Users can insert their own leads" ON leads;
DROP POLICY IF EXISTS "Users can update their own leads" ON leads;
DROP POLICY IF EXISTS "Users can delete their own leads" ON leads;

-- Lead stage history
DROP POLICY IF EXISTS "Users can view stage history for their leads" ON lead_stage_history;
DROP POLICY IF EXISTS "Users can insert stage history for their leads" ON lead_stage_history;

-- Jobs
DROP POLICY IF EXISTS "Users can view their own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can insert their own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can update their own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can delete their own jobs" ON jobs;

-- Spend
DROP POLICY IF EXISTS "Users can view their own spend" ON spend;
DROP POLICY IF EXISTS "Users can insert their own spend" ON spend;
DROP POLICY IF EXISTS "Users can update their own spend" ON spend;
DROP POLICY IF EXISTS "Users can delete their own spend" ON spend;

-- Shared costs
DROP POLICY IF EXISTS "Users can view their own shared_costs" ON shared_costs;
DROP POLICY IF EXISTS "Users can insert their own shared_costs" ON shared_costs;
DROP POLICY IF EXISTS "Users can update their own shared_costs" ON shared_costs;
DROP POLICY IF EXISTS "Users can delete their own shared_costs" ON shared_costs;

-- Settings
DROP POLICY IF EXISTS "Users can view their own settings" ON settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON settings;

-- =============================================================================
-- CREATE NEW SHARED ACCESS POLICIES
-- =============================================================================

-- Channels policies (authorized users can access all)
CREATE POLICY "Authorized users can view all channels"
  ON channels FOR SELECT
  USING (is_authorized_user());

CREATE POLICY "Authorized users can insert channels"
  ON channels FOR INSERT
  WITH CHECK (is_authorized_user());

CREATE POLICY "Authorized users can update all channels"
  ON channels FOR UPDATE
  USING (is_authorized_user());

CREATE POLICY "Authorized users can delete all channels"
  ON channels FOR DELETE
  USING (is_authorized_user());

-- Services policies
CREATE POLICY "Authorized users can view all services"
  ON services FOR SELECT
  USING (is_authorized_user());

CREATE POLICY "Authorized users can insert services"
  ON services FOR INSERT
  WITH CHECK (is_authorized_user());

CREATE POLICY "Authorized users can update all services"
  ON services FOR UPDATE
  USING (is_authorized_user());

CREATE POLICY "Authorized users can delete all services"
  ON services FOR DELETE
  USING (is_authorized_user());

-- Lost reasons policies
CREATE POLICY "Authorized users can view all lost_reasons"
  ON lost_reasons FOR SELECT
  USING (is_authorized_user());

CREATE POLICY "Authorized users can insert lost_reasons"
  ON lost_reasons FOR INSERT
  WITH CHECK (is_authorized_user());

CREATE POLICY "Authorized users can update all lost_reasons"
  ON lost_reasons FOR UPDATE
  USING (is_authorized_user());

CREATE POLICY "Authorized users can delete all lost_reasons"
  ON lost_reasons FOR DELETE
  USING (is_authorized_user());

-- Leads policies
CREATE POLICY "Authorized users can view all leads"
  ON leads FOR SELECT
  USING (is_authorized_user());

CREATE POLICY "Authorized users can insert leads"
  ON leads FOR INSERT
  WITH CHECK (is_authorized_user());

CREATE POLICY "Authorized users can update all leads"
  ON leads FOR UPDATE
  USING (is_authorized_user());

CREATE POLICY "Authorized users can delete all leads"
  ON leads FOR DELETE
  USING (is_authorized_user());

-- Lead stage history policies
CREATE POLICY "Authorized users can view all stage history"
  ON lead_stage_history FOR SELECT
  USING (is_authorized_user());

CREATE POLICY "Authorized users can insert stage history"
  ON lead_stage_history FOR INSERT
  WITH CHECK (is_authorized_user());

-- Jobs policies
CREATE POLICY "Authorized users can view all jobs"
  ON jobs FOR SELECT
  USING (is_authorized_user());

CREATE POLICY "Authorized users can insert jobs"
  ON jobs FOR INSERT
  WITH CHECK (is_authorized_user());

CREATE POLICY "Authorized users can update all jobs"
  ON jobs FOR UPDATE
  USING (is_authorized_user());

CREATE POLICY "Authorized users can delete all jobs"
  ON jobs FOR DELETE
  USING (is_authorized_user());

-- Spend policies
CREATE POLICY "Authorized users can view all spend"
  ON spend FOR SELECT
  USING (is_authorized_user());

CREATE POLICY "Authorized users can insert spend"
  ON spend FOR INSERT
  WITH CHECK (is_authorized_user());

CREATE POLICY "Authorized users can update all spend"
  ON spend FOR UPDATE
  USING (is_authorized_user());

CREATE POLICY "Authorized users can delete all spend"
  ON spend FOR DELETE
  USING (is_authorized_user());

-- Shared costs policies
CREATE POLICY "Authorized users can view all shared_costs"
  ON shared_costs FOR SELECT
  USING (is_authorized_user());

CREATE POLICY "Authorized users can insert shared_costs"
  ON shared_costs FOR INSERT
  WITH CHECK (is_authorized_user());

CREATE POLICY "Authorized users can update all shared_costs"
  ON shared_costs FOR UPDATE
  USING (is_authorized_user());

CREATE POLICY "Authorized users can delete all shared_costs"
  ON shared_costs FOR DELETE
  USING (is_authorized_user());

-- Settings policies
CREATE POLICY "Authorized users can view all settings"
  ON settings FOR SELECT
  USING (is_authorized_user());

CREATE POLICY "Authorized users can insert settings"
  ON settings FOR INSERT
  WITH CHECK (is_authorized_user());

CREATE POLICY "Authorized users can update all settings"
  ON settings FOR UPDATE
  USING (is_authorized_user());
