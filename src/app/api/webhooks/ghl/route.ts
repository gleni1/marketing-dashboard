import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Create Supabase client lazily (service role key for webhooks)
function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, key);
}

// GHL Custom Data fields sent via workflow webhook
interface GHLCustomData {
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
}

// GHL webhook payload - custom data may be nested or flat
interface GHLWebhookPayload {
  // Custom data may be nested under customData or at top level
  customData?: GHLCustomData;

  // Or flat at root level
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

  // Catch-all for any other fields GHL sends
  [key: string]: unknown;
}

// Constant-time string comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    const dummy = Buffer.from(a);
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Extract custom data, handling both nested and flat structures
function extractCustomData(payload: GHLWebhookPayload): GHLCustomData {
  // If customData object exists, use it
  if (payload.customData && typeof payload.customData === "object") {
    return payload.customData;
  }

  // Otherwise, extract from top level
  return {
    secret: payload.secret as string | undefined,
    contact_id: payload.contact_id as string | undefined,
    name: payload.name as string | undefined,
    phone: payload.phone as string | undefined,
    city: payload.city as string | undefined,
    source: payload.source as string | undefined,
    utm_source: payload.utm_source as string | undefined,
    service: payload.service as string | undefined,
    opportunity_id: payload.opportunity_id as string | undefined,
    pipeline: payload.pipeline as string | undefined,
  };
}

function normalizePhone(phone: string | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

// Channel mapping per docs/build-plan.md:
// utm_source=google → Google Ads
// facebook / instagram / fbclid present → Meta Ads
// GHL source "LSA" → Local Services Ads
// GBP call tracking number → Google Business Profile
// no match → left blank
function mapToChannel(
  utmSource: string | undefined,
  source: string | undefined,
  channels: Array<{ id: string; name: string }>
): string | null {
  // Try utm_source first, then source
  const sourceToMatch = (utmSource || source || "").toLowerCase();

  if (!sourceToMatch) return null;

  for (const channel of channels) {
    const channelLower = channel.name.toLowerCase();

    // utm_source=google → Google Ads
    if (sourceToMatch === "google" && channelLower.includes("google ads")) {
      return channel.id;
    }
    if (sourceToMatch.includes("google") && channelLower.includes("google ads")) {
      return channel.id;
    }

    // facebook / instagram / fbclid → Meta Ads
    if (
      (sourceToMatch.includes("facebook") ||
        sourceToMatch.includes("instagram") ||
        sourceToMatch.includes("fbclid") ||
        sourceToMatch.includes("meta")) &&
      channelLower.includes("meta")
    ) {
      return channel.id;
    }

    // LSA → Local Services Ads
    if (
      (sourceToMatch === "lsa" || sourceToMatch.includes("local service")) &&
      channelLower.includes("local service")
    ) {
      return channel.id;
    }

    // GBP → Google Business Profile
    if (
      (sourceToMatch.includes("gbp") || sourceToMatch.includes("google business")) &&
      channelLower.includes("google business")
    ) {
      return channel.id;
    }

    // Referral
    if (sourceToMatch.includes("referral") && channelLower.includes("referral")) {
      return channel.id;
    }
  }

  // No match → leave blank
  return null;
}

export async function POST(request: NextRequest) {
  let payload: GHLWebhookPayload | null = null;
  let supabase: SupabaseClient | null = null;

  try {
    // Parse payload first
    payload = await request.json();

    if (!payload) {
      console.log("GHL Webhook: Empty payload");
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }

    console.log("GHL Webhook received:", JSON.stringify(payload, null, 2));

    // Extract custom data (handles both nested and flat)
    const customData = extractCustomData(payload);

    // Verify webhook secret from body (constant-time compare)
    const expectedSecret = process.env.GHL_WEBHOOK_SECRET;
    const providedSecret = customData.secret || "";

    if (expectedSecret && !secureCompare(providedSecret, expectedSecret)) {
      console.log("GHL Webhook: Invalid secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Initialize Supabase client
    supabase = getSupabaseClient();

    // Extract contact ID from custom data
    const contactId = customData.contact_id || "";

    // Log the raw payload to webhook_log for field mapping
    const { error: logError } = await supabase.from("webhook_log").insert({
      source: "ghl",
      contact_id: contactId || null,
      payload: payload,
      processed: false,
    });

    if (logError) {
      console.log("GHL Webhook: Error logging payload", logError);
      // Continue processing even if logging fails
    }

    // Must have a contact ID
    if (!contactId) {
      console.log("GHL Webhook: No contact_id in payload");

      // Update log to mark as error
      if (supabase) {
        await supabase
          .from("webhook_log")
          .update({ error: "No contact_id", processed: true })
          .eq("payload", payload);
      }

      return NextResponse.json(
        {
          success: false,
          error: "No contact_id",
          logged: true,
        },
        { status: 400 }
      );
    }

    // Get the user (single user system)
    const { data: settings, error: userError } = await supabase
      .from("settings")
      .select("user_id")
      .limit(1)
      .single();

    if (userError || !settings) {
      console.log("GHL Webhook: No user found", userError);
      return NextResponse.json({ error: "No user configured" }, { status: 500 });
    }

    const userId = settings.user_id;

    // Check if lead already exists (by GHL contact ID) - INSERT ONLY
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("ghl_contact_id", contactId)
      .single();

    if (existingLead) {
      console.log("GHL Webhook: Lead already exists for contact", contactId);

      // Mark log as processed (duplicate)
      await supabase
        .from("webhook_log")
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

    // Extract data from custom fields
    const name = customData.name || "";
    const phone = customData.phone || "";
    const phoneNormalized = normalizePhone(phone);
    const town = customData.city || "";
    const service = customData.service || "";

    // Get channels for mapping
    const { data: channels } = await supabase
      .from("channels")
      .select("id, name")
      .eq("user_id", userId)
      .eq("active", true);

    // Map utm_source first, then source to channel (leave blank if no match)
    const channelId = channels
      ? mapToChannel(customData.utm_source, customData.source, channels)
      : null;

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

    // Build notes from source/UTM info
    const noteParts: string[] = [];
    if (customData.utm_source) noteParts.push(`UTM Source: ${customData.utm_source}`);
    if (customData.source) noteParts.push(`Source: ${customData.source}`);
    if (customData.pipeline) noteParts.push(`Pipeline: ${customData.pipeline}`);
    if (customData.opportunity_id) noteParts.push(`Opportunity: ${customData.opportunity_id}`);
    if (service) noteParts.push(`Service: ${service}`);

    // Create the lead
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
        stage: "new",
        duplicate_of: duplicateOf,
        notes: noteParts.length > 0 ? noteParts.join(" | ") : null,
      })
      .select()
      .single();

    if (insertError) {
      console.log("GHL Webhook: Error creating lead", insertError);

      // Mark log as error
      await supabase
        .from("webhook_log")
        .update({ processed: true, error: insertError.message })
        .eq("contact_id", contactId)
        .eq("processed", false);

      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Create initial stage history
    await supabase.from("lead_stage_history").insert({
      lead_id: newLead.id,
      from_stage: null,
      to_stage: "new",
    });

    // Mark log as processed successfully
    await supabase
      .from("webhook_log")
      .update({ processed: true })
      .eq("contact_id", contactId)
      .eq("processed", false);

    console.log("GHL Webhook: Lead created successfully", newLead.id);

    return NextResponse.json({
      success: true,
      message: "Lead created",
      lead_id: newLead.id,
      channel_matched: channelId ? true : false,
      duplicate_phone: duplicateOf ? true : false,
    });
  } catch (error) {
    console.error("GHL Webhook error:", error);

    // Try to log the error
    if (supabase && payload) {
      try {
        const customData = extractCustomData(payload);
        await supabase.from("webhook_log").insert({
          source: "ghl",
          contact_id: customData.contact_id || null,
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

// Handle GET for webhook verification
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "GHL webhook endpoint",
    usage: "POST with secret in body custom data",
  });
}
