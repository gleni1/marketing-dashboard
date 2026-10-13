-- Overview SQL Views
-- Phase 3: Calculate all metrics for the Overview dashboard

-- =============================================================================
-- VIEW: Lead funnel stages reached
-- Tracks the furthest stage each lead ever reached using lead_stage_history
-- =============================================================================

CREATE OR REPLACE VIEW lead_funnel_progress AS
WITH stage_order AS (
  SELECT unnest(ARRAY['new', 'contacted', 'call_again', 'booked', 'no_show', 'estimate_given', 'follow_up', 'sold', 'lost', 'junk']::lead_stage[]) AS stage,
         unnest(ARRAY[1, 2, 2, 3, 3, 4, 4, 5, 0, 0]) AS stage_rank
),
lead_max_stage AS (
  SELECT
    l.id AS lead_id,
    l.user_id,
    l.created_at,
    l.channel_id,
    l.stage AS current_stage,
    COALESCE(
      (SELECT MAX(so.stage_rank)
       FROM lead_stage_history lsh
       JOIN stage_order so ON so.stage = lsh.to_stage
       WHERE lsh.lead_id = l.id),
      (SELECT stage_rank FROM stage_order WHERE stage = l.stage)
    ) AS max_stage_rank
  FROM leads l
)
SELECT
  lead_id,
  user_id,
  created_at,
  channel_id,
  current_stage,
  max_stage_rank,
  max_stage_rank >= 2 AS reached_contacted,
  max_stage_rank >= 3 AS reached_booked,
  -- "Showed" = booked lead whose next stage was NOT no_show
  max_stage_rank >= 3 AND current_stage != 'no_show' AND
    NOT EXISTS (
      SELECT 1 FROM lead_stage_history lsh
      WHERE lsh.lead_id = lead_max_stage.lead_id
      AND lsh.to_stage = 'no_show'
    ) AS showed,
  max_stage_rank >= 4 AS reached_estimate_given,
  max_stage_rank >= 5 AS reached_sold,
  current_stage = 'junk' AS is_junk
FROM lead_max_stage;

-- =============================================================================
-- VIEW: Monthly revenue metrics (by job sold date)
-- =============================================================================

CREATE OR REPLACE VIEW monthly_revenue_metrics AS
SELECT
  j.user_id,
  date_trunc('month', j.sold_date)::date AS month,
  j.channel_id,
  COUNT(*) AS jobs_sold,
  COALESCE(SUM(j.sold_amount), 0) AS revenue,
  CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(j.sold_amount), 0) / COUNT(*) ELSE 0 END AS avg_ticket,
  COALESCE(SUM(j.gross_profit), 0) AS gross_profit,
  CASE WHEN SUM(j.sold_amount) > 0
    THEN COALESCE(SUM(j.gross_profit), 0) / SUM(j.sold_amount) * 100
    ELSE 0
  END AS margin_pct
FROM jobs j
GROUP BY j.user_id, date_trunc('month', j.sold_date), j.channel_id;

-- =============================================================================
-- VIEW: Monthly lead metrics (by lead created date)
-- =============================================================================

CREATE OR REPLACE VIEW monthly_lead_metrics AS
SELECT
  lfp.user_id,
  date_trunc('month', lfp.created_at)::date AS month,
  lfp.channel_id,
  COUNT(*) AS total_leads,
  COUNT(*) FILTER (WHERE lfp.reached_contacted) AS contacted,
  COUNT(*) FILTER (WHERE lfp.reached_booked) AS booked,
  COUNT(*) FILTER (WHERE lfp.showed) AS showed,
  COUNT(*) FILTER (WHERE lfp.reached_estimate_given) AS estimated,
  COUNT(*) FILTER (WHERE lfp.reached_sold) AS sold,
  COUNT(*) FILTER (WHERE lfp.is_junk) AS junk
FROM lead_funnel_progress lfp
GROUP BY lfp.user_id, date_trunc('month', lfp.created_at), lfp.channel_id;

-- =============================================================================
-- VIEW: Monthly spend by channel
-- =============================================================================

CREATE OR REPLACE VIEW monthly_spend AS
SELECT
  s.user_id,
  s.month,
  s.channel_id,
  s.amount AS spend
FROM spend s;

-- =============================================================================
-- VIEW: Channel performance metrics
-- Combines leads, spend, and revenue for each channel
-- =============================================================================

CREATE OR REPLACE VIEW channel_performance AS
WITH lead_metrics AS (
  SELECT
    user_id,
    month,
    channel_id,
    total_leads,
    contacted,
    booked,
    showed,
    estimated,
    sold,
    junk
  FROM monthly_lead_metrics
),
spend_metrics AS (
  SELECT
    user_id,
    month,
    channel_id,
    spend
  FROM monthly_spend
),
-- Revenue is linked back to the lead's channel and lead's created month
revenue_from_leads AS (
  SELECT
    l.user_id,
    date_trunc('month', l.created_at)::date AS month,
    l.channel_id,
    COUNT(j.id) AS jobs_from_leads,
    COALESCE(SUM(j.sold_amount), 0) AS revenue_from_leads
  FROM leads l
  LEFT JOIN jobs j ON j.lead_id = l.id
  GROUP BY l.user_id, date_trunc('month', l.created_at), l.channel_id
)
SELECT
  COALESCE(lm.user_id, sm.user_id, rf.user_id) AS user_id,
  COALESCE(lm.month, sm.month, rf.month) AS month,
  COALESCE(lm.channel_id, sm.channel_id, rf.channel_id) AS channel_id,
  COALESCE(lm.total_leads, 0) AS leads,
  COALESCE(lm.contacted, 0) AS contacted,
  COALESCE(lm.booked, 0) AS booked,
  COALESCE(lm.showed, 0) AS showed,
  COALESCE(lm.estimated, 0) AS estimated,
  COALESCE(lm.sold, 0) AS sold_from_funnel,
  COALESCE(lm.junk, 0) AS junk,
  COALESCE(sm.spend, 0) AS spend,
  COALESCE(rf.jobs_from_leads, 0) AS jobs_sold,
  COALESCE(rf.revenue_from_leads, 0) AS revenue,
  -- CPL = spend / leads
  CASE WHEN COALESCE(lm.total_leads, 0) > 0
    THEN COALESCE(sm.spend, 0) / lm.total_leads
    ELSE NULL
  END AS cpl,
  -- Junk % = junk / total leads
  CASE WHEN COALESCE(lm.total_leads, 0) > 0
    THEN COALESCE(lm.junk, 0)::numeric / lm.total_leads * 100
    ELSE 0
  END AS junk_pct,
  -- Close rate = sold / estimated (excluding junk)
  CASE WHEN COALESCE(lm.estimated, 0) > 0
    THEN COALESCE(lm.sold, 0)::numeric / lm.estimated * 100
    ELSE 0
  END AS close_rate,
  -- CAC = spend / jobs sold
  CASE WHEN COALESCE(rf.jobs_from_leads, 0) > 0
    THEN COALESCE(sm.spend, 0) / rf.jobs_from_leads
    ELSE NULL
  END AS cac,
  -- ROAS = revenue / spend
  CASE WHEN COALESCE(sm.spend, 0) > 0
    THEN COALESCE(rf.revenue_from_leads, 0) / sm.spend
    ELSE NULL
  END AS roas
FROM lead_metrics lm
FULL OUTER JOIN spend_metrics sm
  ON lm.user_id = sm.user_id AND lm.month = sm.month AND lm.channel_id = sm.channel_id
FULL OUTER JOIN revenue_from_leads rf
  ON COALESCE(lm.user_id, sm.user_id) = rf.user_id
  AND COALESCE(lm.month, sm.month) = rf.month
  AND COALESCE(lm.channel_id, sm.channel_id) = rf.channel_id;

-- =============================================================================
-- VIEW: Overall monthly metrics (all channels combined)
-- =============================================================================

CREATE OR REPLACE VIEW monthly_overview AS
SELECT
  cp.user_id,
  cp.month,
  SUM(cp.leads) AS total_leads,
  SUM(cp.contacted) AS total_contacted,
  SUM(cp.booked) AS total_booked,
  SUM(cp.showed) AS total_showed,
  SUM(cp.estimated) AS total_estimated,
  SUM(cp.sold_from_funnel) AS total_sold,
  SUM(cp.junk) AS total_junk,
  SUM(cp.spend) AS total_spend,
  SUM(cp.jobs_sold) AS total_jobs,
  SUM(cp.revenue) AS total_revenue,
  -- Funnel rates
  CASE WHEN SUM(cp.leads) > 0
    THEN SUM(cp.contacted)::numeric / SUM(cp.leads) * 100
    ELSE 0
  END AS contact_rate,
  CASE WHEN SUM(cp.contacted) > 0
    THEN SUM(cp.booked)::numeric / SUM(cp.contacted) * 100
    ELSE 0
  END AS booking_rate,
  CASE WHEN SUM(cp.booked) > 0
    THEN SUM(cp.showed)::numeric / SUM(cp.booked) * 100
    ELSE 0
  END AS show_rate,
  CASE WHEN SUM(cp.showed) > 0
    THEN SUM(cp.estimated)::numeric / SUM(cp.showed) * 100
    ELSE 0
  END AS estimate_rate,
  CASE WHEN SUM(cp.estimated) > 0
    THEN SUM(cp.sold_from_funnel)::numeric / SUM(cp.estimated) * 100
    ELSE 0
  END AS close_rate,
  -- Overall metrics
  CASE WHEN SUM(cp.leads) > 0
    THEN SUM(cp.junk)::numeric / SUM(cp.leads) * 100
    ELSE 0
  END AS junk_pct,
  CASE WHEN SUM(cp.leads) > 0
    THEN SUM(cp.spend) / SUM(cp.leads)
    ELSE NULL
  END AS avg_cpl,
  CASE WHEN SUM(cp.jobs_sold) > 0
    THEN SUM(cp.spend) / SUM(cp.jobs_sold)
    ELSE NULL
  END AS cac,
  CASE WHEN SUM(cp.jobs_sold) > 0
    THEN SUM(cp.revenue) / SUM(cp.jobs_sold)
    ELSE 0
  END AS avg_ticket,
  CASE WHEN SUM(cp.revenue) > 0
    THEN SUM(cp.spend) / SUM(cp.revenue) * 100
    ELSE 0
  END AS marketing_pct_of_revenue,
  CASE WHEN SUM(cp.spend) > 0
    THEN SUM(cp.revenue) / SUM(cp.spend)
    ELSE NULL
  END AS roas
FROM channel_performance cp
GROUP BY cp.user_id, cp.month;

-- =============================================================================
-- Enable RLS on views (views inherit from base tables, but we add policies)
-- =============================================================================

-- Note: Views automatically inherit RLS from their underlying tables.
-- No additional policies needed as long as the base tables have RLS enabled.
