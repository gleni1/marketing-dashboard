-- Ace Roofing Dashboard - Seed Data
-- Note: This seed data requires a user_id. In production, this is run
-- via a database function when a new user signs up.

-- =============================================================================
-- SEED FUNCTION: Called when a new user is created
-- =============================================================================

CREATE OR REPLACE FUNCTION seed_user_data(p_user_id uuid)
RETURNS void AS $$
BEGIN
  -- Insert channels
  INSERT INTO channels (user_id, name, spend_source, sort_order) VALUES
    (p_user_id, 'Google Ads', 'synced', 1),
    (p_user_id, 'Meta Ads', 'synced', 2),
    (p_user_id, 'Local Services Ads', 'synced', 3),
    (p_user_id, 'Referral', 'manual', 4),
    (p_user_id, 'Google Business Profile', 'none', 5),
    (p_user_id, 'Repeat customer', 'none', 6),
    (p_user_id, 'Yard signs & truck', 'manual', 7);

  -- Insert services
  INSERT INTO services (user_id, name, sort_order) VALUES
    (p_user_id, 'Roof replacement', 1),
    (p_user_id, 'Roof repair', 2),
    (p_user_id, 'Gutters', 3),
    (p_user_id, 'Siding', 4);

  -- Insert lost reasons
  INSERT INTO lost_reasons (user_id, name) VALUES
    (p_user_id, 'Price'),
    (p_user_id, 'Went with competitor'),
    (p_user_id, 'No decision'),
    (p_user_id, 'Insurance denied'),
    (p_user_id, 'Other');

  -- Insert default settings with targets
  INSERT INTO settings (user_id, hourly_rate, shared_cost_mode, targets) VALUES
    (p_user_id, 75, 'overall_cac_only', '{
      "contact_rate": 90,
      "booking_rate": 50,
      "show_rate": 80,
      "estimate_rate": 85,
      "close_rate": 35,
      "junk_pct": 25,
      "marketing_pct": 8,
      "cac": 1200
    }'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- TRIGGER: Auto-seed when a new user is created
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  PERFORM seed_user_data(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users (Supabase auth schema)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
