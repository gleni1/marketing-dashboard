"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ChannelSpendSource, SharedCostMode, Targets } from "@/lib/types";

export async function saveChannels(
  channels: Array<{
    id?: string;
    name: string;
    spend_source: ChannelSpendSource;
    active: boolean;
    sort_order: number;
  }>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Separate existing and new channels
  const existingChannels = channels.filter((c) => c.id);
  const newChannels = channels.filter((c) => !c.id);

  // Update existing channels
  for (const channel of existingChannels) {
    const { error } = await supabase
      .from("channels")
      .update({
        name: channel.name,
        spend_source: channel.spend_source,
        active: channel.active,
        sort_order: channel.sort_order,
      })
      .eq("id", channel.id!);

    if (error) {
      return { error: error.message };
    }
  }

  // Insert new channels
  if (newChannels.length > 0) {
    const { error } = await supabase.from("channels").insert(
      newChannels.map((c) => ({
        user_id: user.id,
        name: c.name,
        spend_source: c.spend_source,
        active: c.active,
        sort_order: c.sort_order,
      }))
    );

    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function deleteChannel(channelId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("channels")
    .delete()
    .eq("id", channelId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function saveServices(
  services: Array<{
    id?: string;
    name: string;
    sort_order: number;
  }>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const existingServices = services.filter((s) => s.id);
  const newServices = services.filter((s) => !s.id);

  for (const service of existingServices) {
    const { error } = await supabase
      .from("services")
      .update({
        name: service.name,
        sort_order: service.sort_order,
      })
      .eq("id", service.id!);

    if (error) {
      return { error: error.message };
    }
  }

  if (newServices.length > 0) {
    const { error } = await supabase.from("services").insert(
      newServices.map((s) => ({
        user_id: user.id,
        name: s.name,
        sort_order: s.sort_order,
      }))
    );

    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function deleteService(serviceId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function saveLostReasons(
  reasons: Array<{
    id?: string;
    name: string;
  }>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const existingReasons = reasons.filter((r) => r.id);
  const newReasons = reasons.filter((r) => !r.id);

  for (const reason of existingReasons) {
    const { error } = await supabase
      .from("lost_reasons")
      .update({ name: reason.name })
      .eq("id", reason.id!);

    if (error) {
      return { error: error.message };
    }
  }

  if (newReasons.length > 0) {
    const { error } = await supabase.from("lost_reasons").insert(
      newReasons.map((r) => ({
        user_id: user.id,
        name: r.name,
      }))
    );

    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function deleteLostReason(reasonId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("lost_reasons")
    .delete()
    .eq("id", reasonId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function saveSettings(settings: {
  hourly_rate: number;
  shared_cost_mode: SharedCostMode;
  targets: Targets;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("settings")
    .update({
      hourly_rate: settings.hourly_rate,
      shared_cost_mode: settings.shared_cost_mode,
      targets: settings.targets,
    })
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}
