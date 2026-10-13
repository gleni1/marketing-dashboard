import { createClient } from "@/lib/supabase/server";
import { SpendView } from "./SpendView";
import type { Channel, Spend, SharedCost } from "@/lib/types";

export default async function SpendPage() {
  const supabase = await createClient();

  const [channelsRes, spendRes, sharedCostsRes] = await Promise.all([
    supabase
      .from("channels")
      .select("*")
      .eq("active", true)
      .order("sort_order"),
    supabase.from("spend").select("*").order("month"),
    supabase.from("shared_costs").select("*").order("month"),
  ]);

  const channels = (channelsRes.data as Channel[]) || [];
  const spend = (spendRes.data as Spend[]) || [];
  const sharedCosts = (sharedCostsRes.data as SharedCost[]) || [];

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-7 pb-14 flex flex-col gap-6">
      <SpendView
        channels={channels}
        spend={spend}
        sharedCosts={sharedCosts}
      />
    </main>
  );
}
