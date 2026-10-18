import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Force Node.js runtime (required for crypto.timingSafeEqual)
export const runtime = "nodejs";

// Supabase client (service role for server-side operations)
function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, key);
}

// Expected fields from Zapier/GHL
interface WebhookPayload {
  secret?: string;
  contact_id?: string;
  name?: string;
  phone?: string;
  city?: string;
  source?: string;
  utm_source?: string;
  service?: string;
  opportunity_id?: string;
  pipeline?: string;
  [key: string]: unknown;
}

// Constant-time comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const dummy = Buffer.from(a);
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function normalizePhone(phone: string | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

// Map source to channel per docs/build-plan.md
function mapToChannel(
  utmSource: string | undefined,
  source: string | undefined,
  channels: Array<{ id: string; name: string }>
): string | null {
  const sourceToMatch = (utmSource || source || "").toLowerCase();
  if (!sourceToMatch) return null;

  for (const channel of channels) {
    const name = channel.name.toLowerCase();

    if (sourceToMatch.includes("google") && name.includes("google ads")) {
      return channel.id;
    }
    if ((sourceToMatch.includes("facebook") || sourceToMatch.includes("instagram") ||
         sourceToMatch.includes("fbclid") || sourceToMatch.includes("meta")) && name.includes("meta")) {
      return channel.id;
    }
    if ((sourceToMatch === "lsa" || sourceToMatch.includes("local service")) && name.includes("local service")) {
      return channel.id;
    }
    if ((sourceToMatch.includes("gbp") || sourceToMatch.includes("google business")) && name.includes("google business")) {
      return channel.id;
    }
    if (sourceToMatch.includes("referral") && name.includes("referral")) {
      return channel.id;
    }
    if (sourceToMatch.includes("seo") && name.toLowerCase().includes("seo")) {
      return channel.id;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  let supabase: SupabaseClient | null = null;
  let payload: WebhookPayload | null = null;

  try {
    payload = await request.json();

    if (!payload) {
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }

    // Initialize Supabase
    supabase = getSupabaseClient();

    // Log raw payload for debugging
    await supabase.from("webhook_log").insert({
      source: "ghl",
      contact_id: payload.contact_id || null,
      payload: payload,
      processed: false,
    });

    // Verify secret
    const expectedSecret = process.env.GHL_WEBHOOK_SECRET || "";
    const providedSecret = payload.secret || "";

    if (expectedSecret && !secureCompare(providedSecret, expectedSecret)) {
      await supabase.from("webhook_log")
        .update({ processed: true, error: "Invalid secret" })
        .eq("contact_id", payload.contact_id || "")
        .eq("processed", false);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Require contact_id
    const contactId = payload.contact_id || "";
    if (!contactId) {
      await supabase.from("webhook_log")
        .update({ processed: true, error: "No contact_id" })
        .is("contact_id", null)
        .eq("processed", false);
      return NextResponse.json({ error: "No contact_id" }, { status: 400 });
    }

    // Get user (single-user system)
    const { data: settings, error: userError } = await supabase
      .from("settings")
      .select("user_id")
      .limit(1)
      .single();

    if (userError || !settings) {
      return NextResponse.json({ error: "No user configured" }, { status: 500 });
    }

    const userId = settings.user_id;

    // Check for existing lead (insert-only)
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("ghl_contact_id", contactId)
      .single();

    if (existingLead) {
      await supabase.from("webhook_log")
        .update({ processed: true, error: "Duplicate - lead exists" })
        .eq("contact_id", contactId)
        .eq("processed", false);

      return NextResponse.json({
        success: true,
        message: "Lead already exists - skipped",
        lead_id: existingLead.id,
        duplicate: true,
      });
    }

    // Extract fields
    const name = payload.name || "";
    const phone = payload.phone || "";
    const phoneNormalized = normalizePhone(phone);
    const town = payload.city || "";

    // Map to channel
    const { data: channels } = await supabase
      .from("channels")
      .select("id, name")
      .eq("user_id", userId)
      .eq("active", true);

    const channelId = channels ? mapToChannel(payload.utm_source, payload.source, channels) : null;

    // Map service name to service_id
    let serviceId: string | null = null;
    if (payload.service) {
      const serviceName = payload.service.toLowerCase().trim();
      const { data: services } = await supabase
        .from("services")
        .select("id, name")
        .eq("user_id", userId)
        .eq("active", true);

      if (services) {
        const match = services.find(s => s.name.toLowerCase().trim() === serviceName);
        if (match) {
          serviceId = match.id;
        }
      }
    }

    // Check for duplicate phone
    let duplicateOf: string | null = null;
    if (phoneNormalized) {
      const { data: existingByPhone } = await supabase
        .from("leads")
        .select("id")
        .eq("user_id", userId)
        .eq("phone_normalized", phoneNormalized)
        .limit(1)
        .single();

      if (existingByPhone) {
        duplicateOf = existingByPhone.id;
      }
    }

    // Build notes
    const notes: string[] = [];
    if (payload.utm_source) notes.push(`UTM: ${payload.utm_source}`);
    if (payload.source) notes.push(`Source: ${payload.source}`);
    if (payload.service) notes.push(`Service: ${payload.service}`);
    if (payload.pipeline) notes.push(`Pipeline: ${payload.pipeline}`);

    // Create lead
    const { data: newLead, error: insertError } = await supabase
      .from("leads")
      .insert({
        user_id: userId,
        origin: "ghl",
        ghl_contact_id: contactId,
        name: name || null,
        phone: phone || null,
        phone_normalized: phoneNormalized || null,
        town: town || null,
        channel_id: channelId,
        service_id: serviceId,
        stage: "new",
        duplicate_of: duplicateOf,
        notes: notes.length > 0 ? notes.join(" | ") : null,
      })
      .select()
      .single();

    if (insertError) {
      await supabase.from("webhook_log")
        .update({ processed: true, error: insertError.message })
        .eq("contact_id", contactId)
        .eq("processed", false);

      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Create stage history
    await supabase.from("lead_stage_history").insert({
      lead_id: newLead.id,
      from_stage: null,
      to_stage: "new",
    });

    // Mark as processed
    await supabase.from("webhook_log")
      .update({ processed: true })
      .eq("contact_id", contactId)
      .eq("processed", false);

    return NextResponse.json({
      success: true,
      message: "Lead created",
      lead_id: newLead.id,
      channel_matched: !!channelId,
      service_matched: !!serviceId,
      duplicate_phone: !!duplicateOf,
    });

  } catch (error) {
    if (supabase && payload) {
      try {
        await supabase.from("webhook_log").insert({
          source: "ghl",
          contact_id: payload.contact_id || null,
          payload: payload,
          processed: true,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } catch {
        // Ignore logging errors
      }
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "GHL webhook endpoint ready",
  });
}
