import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type {
  Channel,
  Service,
  LostReason,
  Lead,
  Job,
  Spend,
  SharedCost,
  Settings,
  LeadStageHistory,
} from "@/lib/types";

// Create a stable supabase client
const getSupabase = () => createClient();

// ============ CHANNELS ============
export function useChannels(activeOnly = true) {
  return useSWR(
    `channels-${activeOnly ? "active" : "all"}`,
    async () => {
      const supabase = getSupabase();
      let query = supabase.from("channels").select("*").order("sort_order");
      if (activeOnly) {
        query = query.eq("active", true);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data as Channel[]) || [];
    }
  );
}

// ============ SERVICES ============
export function useServices(activeOnly = true) {
  return useSWR(
    `services-${activeOnly ? "active" : "all"}`,
    async () => {
      const supabase = getSupabase();
      let query = supabase.from("services").select("*").order("sort_order");
      if (activeOnly) {
        query = query.eq("active", true);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data as Service[]) || [];
    }
  );
}

// ============ LOST REASONS ============
export function useLostReasons(activeOnly = true) {
  return useSWR(
    `lost_reasons-${activeOnly ? "active" : "all"}`,
    async () => {
      const supabase = getSupabase();
      let query = supabase.from("lost_reasons").select("*");
      if (activeOnly) {
        query = query.eq("active", true);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data as LostReason[]) || [];
    }
  );
}

// ============ SETTINGS ============
export function useSettings() {
  return useSWR("settings", async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("settings").select("*").single();
    if (error && error.code !== "PGRST116") throw error; // Ignore "no rows" error
    return data as Settings | null;
  });
}

// ============ LEADS ============
type LeadWithRelations = Lead & {
  channel: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
  lost_reason: { id: string; name: string } | null;
  jobs: { id: string }[];
};

export function useLeads() {
  return useSWR("leads", async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("leads")
      .select(
        `
        *,
        channel:channels(id, name),
        service:services(id, name),
        lost_reason:lost_reasons(id, name),
        jobs(id)
      `
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as LeadWithRelations[]) || [];
  });
}

// ============ JOBS ============
type JobWithRelations = Job & {
  channel: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
  lead: { id: string; name: string } | null;
};

export function useJobs() {
  return useSWR("jobs", async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("jobs")
      .select(
        `
        *,
        channel:channels(id, name),
        service:services(id, name),
        lead:leads(id, name)
      `
      )
      .order("sold_date", { ascending: false });
    if (error) throw error;
    return (data as JobWithRelations[]) || [];
  });
}

// ============ SPEND ============
export function useSpend() {
  return useSWR("spend", async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("spend")
      .select("*")
      .order("month");
    if (error) throw error;
    return (data as Spend[]) || [];
  });
}

// ============ SHARED COSTS ============
export function useSharedCosts() {
  return useSWR("shared_costs", async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("shared_costs")
      .select("*")
      .order("month");
    if (error) throw error;
    return (data as SharedCost[]) || [];
  });
}

// ============ STAGE HISTORY ============
export function useStageHistory() {
  return useSWR("stage_history", async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("lead_stage_history")
      .select("*");
    if (error) throw error;
    return (data as LeadStageHistory[]) || [];
  });
}

// ============ OVERVIEW DATA ============
// Combined hook for overview page to minimize requests
interface OverviewData {
  settings: Settings | null;
  channels: Channel[];
  leads: (Lead & { jobs: { id: string; sold_amount: number | null }[] })[];
  jobs: Job[];
  spend: Spend[];
  stageHistory: LeadStageHistory[];
}

export function useOverviewData(dateRange: { start: string; end: string; spendMonths: string[] }) {
  return useSWR(
    `overview-${dateRange.start}-${dateRange.end}`,
    async (): Promise<OverviewData> => {
      const supabase = getSupabase();

      const [
        settingsRes,
        channelsRes,
        leadsRes,
        jobsRes,
        spendRes,
        stageHistoryRes,
      ] = await Promise.all([
        supabase.from("settings").select("*").single(),
        supabase.from("channels").select("*").eq("active", true).order("sort_order"),
        supabase
          .from("leads")
          .select("*, jobs(id, sold_amount)")
          .gte("created_at", dateRange.start)
          .lte("created_at", dateRange.end + "T23:59:59"),
        supabase
          .from("jobs")
          .select("*")
          .gte("sold_date", dateRange.start)
          .lte("sold_date", dateRange.end),
        supabase
          .from("spend")
          .select("*")
          .in("month", dateRange.spendMonths),
        supabase.from("lead_stage_history").select("*"),
      ]);

      return {
        settings: settingsRes.data as Settings | null,
        channels: (channelsRes.data as Channel[]) || [],
        leads: (leadsRes.data as (Lead & { jobs: { id: string; sold_amount: number | null }[] })[]) || [],
        jobs: (jobsRes.data as Job[]) || [],
        spend: (spendRes.data as Spend[]) || [],
        stageHistory: (stageHistoryRes.data as LeadStageHistory[]) || [],
      };
    }
  );
}

// ============ SINGLE LEAD (for prefill) ============
export function useLead(leadId: string | null) {
  return useSWR(
    leadId ? `lead-${leadId}` : null,
    async () => {
      if (!leadId) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();
      if (error) throw error;
      return data as Lead;
    }
  );
}

// ============ CACHE INVALIDATION ============
import { mutate } from "swr";

export function invalidateLeads() {
  mutate("leads");
}

export function invalidateJobs() {
  mutate("jobs");
}

export function invalidateSpend() {
  mutate("spend");
}

export function invalidateSharedCosts() {
  mutate("shared_costs");
}

export function invalidateSettings() {
  mutate("settings");
}

export function invalidateChannels() {
  mutate("channels-active");
  mutate("channels-all");
}

export function invalidateServices() {
  mutate("services-active");
  mutate("services-all");
}

export function invalidateLostReasons() {
  mutate("lost_reasons-active");
  mutate("lost_reasons-all");
}

export function invalidateAll() {
  // Invalidate all cached data
  mutate(() => true, undefined, { revalidate: true });
}
