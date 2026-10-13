"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { JobStatus } from "@/lib/types";

export async function createJob(formData: {
  lead_id?: string | null;
  sold_date: string;
  customer: string;
  town: string;
  service_id: string | null;
  channel_id: string | null;
  referrer_name: string;
  status: JobStatus;
  sold_amount: number | null;
  job_cost: number | null;
  gross_profit: number | null;
  notes: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase.from("jobs").insert({
    user_id: user.id,
    lead_id: formData.lead_id || null,
    sold_date: formData.sold_date,
    customer: formData.customer || null,
    town: formData.town || null,
    service_id: formData.service_id || null,
    channel_id: formData.channel_id || null,
    referrer_name: formData.referrer_name || null,
    status: formData.status,
    sold_amount: formData.sold_amount,
    job_cost: formData.job_cost,
    gross_profit: formData.gross_profit,
    notes: formData.notes || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/jobs");
  revalidatePath("/leads");
  return { success: true };
}

export async function updateJob(
  jobId: string,
  formData: {
    sold_date?: string;
    customer?: string;
    town?: string;
    service_id?: string | null;
    channel_id?: string | null;
    referrer_name?: string;
    status?: JobStatus;
    sold_amount?: number | null;
    job_cost?: number | null;
    gross_profit?: number | null;
    notes?: string;
  }
) {
  const supabase = await createClient();

  const updates: Record<string, unknown> = {};

  if (formData.sold_date !== undefined) updates.sold_date = formData.sold_date;
  if (formData.customer !== undefined)
    updates.customer = formData.customer || null;
  if (formData.town !== undefined) updates.town = formData.town || null;
  if (formData.service_id !== undefined)
    updates.service_id = formData.service_id || null;
  if (formData.channel_id !== undefined)
    updates.channel_id = formData.channel_id || null;
  if (formData.referrer_name !== undefined)
    updates.referrer_name = formData.referrer_name || null;
  if (formData.status !== undefined) updates.status = formData.status;
  if (formData.sold_amount !== undefined)
    updates.sold_amount = formData.sold_amount;
  if (formData.job_cost !== undefined) updates.job_cost = formData.job_cost;
  if (formData.gross_profit !== undefined)
    updates.gross_profit = formData.gross_profit;
  if (formData.notes !== undefined) updates.notes = formData.notes || null;

  const { error } = await supabase.from("jobs").update(updates).eq("id", jobId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/jobs");
  return { success: true };
}

export async function updateJobCostProfit(
  jobId: string,
  field: "job_cost" | "gross_profit",
  value: number | null,
  soldAmount: number | null
) {
  const supabase = await createClient();

  const updates: Record<string, unknown> = {};

  if (field === "job_cost" && value !== null && soldAmount !== null) {
    updates.job_cost = value;
    updates.gross_profit = soldAmount - value;
  } else if (field === "gross_profit" && value !== null && soldAmount !== null) {
    updates.gross_profit = value;
    updates.job_cost = soldAmount - value;
  } else {
    updates[field] = value;
  }

  const { error } = await supabase.from("jobs").update(updates).eq("id", jobId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/jobs");
  return { success: true };
}

export async function deleteJob(jobId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("jobs").delete().eq("id", jobId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/jobs");
  return { success: true };
}
