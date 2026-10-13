import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";
import type { Channel, Service, LostReason, Settings } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();

  const [channelsRes, servicesRes, lostReasonsRes, settingsRes] =
    await Promise.all([
      supabase
        .from("channels")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("services")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase.from("lost_reasons").select("*").order("created_at"),
      supabase.from("settings").select("*").single(),
    ]);

  const channels = (channelsRes.data as Channel[]) || [];
  const services = (servicesRes.data as Service[]) || [];
  const lostReasons = (lostReasonsRes.data as LostReason[]) || [];
  const settings = settingsRes.data as Settings | null;

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-7 pb-14">
      <SettingsForm
        initialChannels={channels}
        initialServices={services}
        initialLostReasons={lostReasons}
        initialSettings={settings}
      />
    </main>
  );
}
