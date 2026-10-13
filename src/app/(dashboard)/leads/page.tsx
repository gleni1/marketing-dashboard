import { createClient } from "@/lib/supabase/server";
import { LeadsView } from "./LeadsView";
import type { Lead, Channel, Service, LostReason } from "@/lib/types";

export default async function LeadsPage() {
  const supabase = await createClient();

  const [leadsRes, channelsRes, servicesRes, lostReasonsRes] =
    await Promise.all([
      supabase
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
        .order("created_at", { ascending: false }),
      supabase
        .from("channels")
        .select("*")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("services")
        .select("*")
        .eq("active", true)
        .order("sort_order"),
      supabase.from("lost_reasons").select("*").eq("active", true),
    ]);

  const leads = (leadsRes.data as (Lead & {
    channel: { id: string; name: string } | null;
    service: { id: string; name: string } | null;
    lost_reason: { id: string; name: string } | null;
    jobs: { id: string }[];
  })[]) || [];

  const channels = (channelsRes.data as Channel[]) || [];
  const services = (servicesRes.data as Service[]) || [];
  const lostReasons = (lostReasonsRes.data as LostReason[]) || [];

  // Find duplicates (leads with duplicate_of set)
  const duplicates = leads.filter((l) => l.duplicate_of);

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-7 pb-14 flex flex-col gap-6">
      <LeadsView
        leads={leads}
        channels={channels}
        services={services}
        lostReasons={lostReasons}
        duplicates={duplicates}
      />
    </main>
  );
}
