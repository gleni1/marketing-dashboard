export type LeadStage =
  | "new"
  | "contacted"
  | "call_again"
  | "booked"
  | "no_show"
  | "estimate_given"
  | "follow_up"
  | "sold"
  | "lost"
  | "junk";

export type JobStatus = "scheduled" | "in_progress" | "complete" | "paid";

export type SpendSource = "sync" | "manual";

export type ChannelSpendSource = "synced" | "manual" | "none";

export type SharedCostMode = "overall_cac_only" | "split_by_lead_count";

export type LeadOrigin = "ghl" | "manual";

export interface Channel {
  id: string;
  user_id: string;
  name: string;
  spend_source: ChannelSpendSource;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  user_id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LostReason {
  id: string;
  user_id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  origin: LeadOrigin;
  ghl_contact_id: string | null;
  name: string | null;
  phone: string | null;
  phone_normalized: string | null;
  town: string | null;
  service_id: string | null;
  channel_id: string | null;
  referrer_name: string | null;
  stage: LeadStage;
  next_step: string | null;
  lost_reason_id: string | null;
  notes: string | null;
  edited_fields: string[];
  duplicate_of: string | null;
}

export interface LeadStageHistory {
  id: string;
  lead_id: string;
  from_stage: LeadStage | null;
  to_stage: LeadStage;
  changed_at: string;
}

export interface Job {
  id: string;
  user_id: string;
  lead_id: string | null;
  sold_date: string;
  customer: string | null;
  town: string | null;
  service_id: string | null;
  channel_id: string | null;
  referrer_name: string | null;
  status: JobStatus;
  sold_amount: number | null;
  job_cost: number | null;
  gross_profit: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Spend {
  id: string;
  user_id: string;
  channel_id: string;
  month: string;
  amount: number;
  source: SpendSource;
  created_at: string;
  updated_at: string;
}

export interface SharedCost {
  id: string;
  user_id: string;
  name: string;
  how: string | null;
  month: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface Targets {
  contact_rate: number;
  booking_rate: number;
  show_rate: number;
  estimate_rate: number;
  close_rate: number;
  junk_pct: number;
  marketing_pct: number;
  cac: number;
}

export interface Settings {
  id: string;
  user_id: string;
  hourly_rate: number;
  shared_cost_mode: SharedCostMode;
  targets: Targets;
  created_at: string;
  updated_at: string;
}
