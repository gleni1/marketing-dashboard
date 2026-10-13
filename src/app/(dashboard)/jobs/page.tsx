import { createClient } from "@/lib/supabase/server";
import { JobsView } from "./JobsView";
import type { Job, Channel, Service, Lead } from "@/lib/types";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ from_lead?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [jobsRes, channelsRes, servicesRes] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        `
        *,
        channel:channels(id, name),
        service:services(id, name),
        lead:leads(id, name)
      `
      )
      .order("sold_date", { ascending: false }),
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
  ]);

  const jobs =
    (jobsRes.data as (Job & {
      channel: { id: string; name: string } | null;
      service: { id: string; name: string } | null;
      lead: { id: string; name: string } | null;
    })[]) || [];

  const channels = (channelsRes.data as Channel[]) || [];
  const services = (servicesRes.data as Service[]) || [];

  // If coming from a lead, get lead data for pre-filling
  let leadData: Lead | null = null;
  if (params.from_lead) {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("id", params.from_lead)
      .single();
    leadData = data as Lead | null;
  }

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-7 pb-14 flex flex-col gap-6">
      <JobsView
        jobs={jobs}
        channels={channels}
        services={services}
        prefillFromLead={leadData}
      />
    </main>
  );
}
