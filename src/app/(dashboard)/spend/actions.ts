"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveSpend(
  spendData: Array<{
    channel_id: string;
    month: string;
    amount: number;
  }>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Batch upsert all spend records at once
  const records = spendData.map((item) => ({
    user_id: user.id,
    channel_id: item.channel_id,
    month: item.month,
    amount: item.amount,
    source: "manual" as const,
  }));

  const { error } = await supabase.from("spend").upsert(records, {
    onConflict: "user_id,channel_id,month",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/spend");
  revalidatePath("/overview");
  return { success: true };
}

export async function saveSharedCosts(
  costs: Array<{
    name: string;
    how: string;
    month: string;
    amount: number;
  }>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Batch upsert all shared costs at once
  const records = costs.map((cost) => ({
    user_id: user.id,
    name: cost.name,
    how: cost.how,
    month: cost.month,
    amount: cost.amount,
  }));

  const { error } = await supabase.from("shared_costs").upsert(records, {
    onConflict: "user_id,name,month",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/spend");
  revalidatePath("/overview");
  return { success: true };
}
