"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { LeadStage } from "@/lib/types";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function createLead(formData: {
  name: string;
  phone: string;
  town: string;
  service_id: string | null;
  channel_id: string;
  notes: string;
  created_at?: string; // Optional custom date (ISO string)
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  if (!formData.channel_id) {
    return { error: "Channel is required" };
  }

  const phone_normalized = normalizePhone(formData.phone);

  // Check for duplicate phone
  let duplicate_of: string | null = null;
  if (phone_normalized) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("phone_normalized", phone_normalized)
      .limit(1)
      .single();

    if (existing) {
      duplicate_of = existing.id;
    }
  }

  // Insert lead
  const insertData: Record<string, unknown> = {
    user_id: user.id,
    name: formData.name || null,
    phone: formData.phone || null,
    phone_normalized: phone_normalized || null,
    town: formData.town || null,
    service_id: formData.service_id || null,
    channel_id: formData.channel_id,
    notes: formData.notes || null,
    stage: "new" as LeadStage,
    origin: "manual",
    duplicate_of,
  };

  // Allow custom date for manual entries (referrals, yard signs, etc.)
  if (formData.created_at) {
    insertData.created_at = formData.created_at;
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  // Insert initial stage history
  await supabase.from("lead_stage_history").insert({
    lead_id: lead.id,
    from_stage: null,
    to_stage: "new",
  });

  revalidatePath("/leads");
  return { success: true, lead };
}

export async function updateLead(
  leadId: string,
  formData: {
    name?: string;
    phone?: string;
    town?: string;
    service_id?: string | null;
    channel_id?: string;
    referrer_name?: string;
    next_step?: string;
    notes?: string;
    created_at?: string; // Date string (YYYY-MM-DD)
  }
) {
  const supabase = await createClient();

  // Get existing lead to track edited fields
  const { data: existingLead } = await supabase
    .from("leads")
    .select("edited_fields")
    .eq("id", leadId)
    .single();

  const editedFields = new Set(existingLead?.edited_fields || []);

  const updates: Record<string, unknown> = {};

  if (formData.name !== undefined) {
    updates.name = formData.name || null;
    editedFields.add("name");
  }
  if (formData.phone !== undefined) {
    updates.phone = formData.phone || null;
    updates.phone_normalized = normalizePhone(formData.phone);
    editedFields.add("phone");
  }
  if (formData.town !== undefined) {
    updates.town = formData.town || null;
    editedFields.add("town");
  }
  if (formData.service_id !== undefined) {
    updates.service_id = formData.service_id || null;
    editedFields.add("service_id");
  }
  if (formData.channel_id !== undefined) {
    updates.channel_id = formData.channel_id;
    editedFields.add("channel_id");
  }
  if (formData.referrer_name !== undefined) {
    updates.referrer_name = formData.referrer_name || null;
  }
  if (formData.next_step !== undefined) {
    updates.next_step = formData.next_step || null;
  }
  if (formData.notes !== undefined) {
    updates.notes = formData.notes || null;
  }
  if (formData.created_at !== undefined) {
    // Convert date string to ISO timestamp
    updates.created_at = new Date(formData.created_at).toISOString();
    editedFields.add("created_at");
  }

  updates.edited_fields = Array.from(editedFields);

  const { error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", leadId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/leads");
  return { success: true };
}

export async function changeLeadStage(
  leadId: string,
  newStage: LeadStage,
  lostReasonId?: string
) {
  const supabase = await createClient();

  // Get current stage
  const { data: lead } = await supabase
    .from("leads")
    .select("stage")
    .eq("id", leadId)
    .single();

  if (!lead) {
    return { error: "Lead not found" };
  }

  const fromStage = lead.stage;

  if (fromStage === newStage) {
    return { success: true }; // No change
  }

  // Validate lost reason
  if (newStage === "lost" && !lostReasonId) {
    return { error: "Lost reason is required" };
  }

  // Update lead
  const updates: Record<string, unknown> = { stage: newStage };
  if (newStage === "lost") {
    updates.lost_reason_id = lostReasonId;
  } else {
    updates.lost_reason_id = null;
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", leadId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Insert stage history
  const { error: historyError } = await supabase
    .from("lead_stage_history")
    .insert({
      lead_id: leadId,
      from_stage: fromStage,
      to_stage: newStage,
    });

  if (historyError) {
    return { error: historyError.message };
  }

  revalidatePath("/leads");

  // Return whether we need to show the job form
  return { success: true, showJobForm: newStage === "sold" };
}

export async function resolveDuplicate(
  leadId: string,
  action: "merge" | "keep_both"
) {
  const supabase = await createClient();

  if (action === "keep_both") {
    // Just clear the duplicate_of field
    const { error } = await supabase
      .from("leads")
      .update({ duplicate_of: null })
      .eq("id", leadId);

    if (error) {
      return { error: error.message };
    }
  } else {
    // Merge: delete the newer lead (the one with duplicate_of set)
    const { error } = await supabase.from("leads").delete().eq("id", leadId);

    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath("/leads");
  return { success: true };
}

export async function deleteLead(leadId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("leads").delete().eq("id", leadId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/leads");
  return { success: true };
}
