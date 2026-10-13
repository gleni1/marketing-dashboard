import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Create Supabase client lazily (service role key for webhooks)
function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, key);
}

// GHL Opportunity/Form webhook payload - fields can be at various levels
// We'll extract what we can and log the full payload for mapping
interface GHLWebhookPayload {
  // Contact fields (may be nested or flat)
  id?: string;
  contact_id?: string;
  contactId?: string;
  contact?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    phone?: string;
    email?: string;
    city?: string;
    source?: string;
    tags?: string[];
    customFields?: Array<{ id: string; key: string; value: string }>;
  };

  // Flat contact fields (sometimes GHL flattens these)
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  full_name?: string;
  fullName?: string;
  name?: string;
  phone?: string;
  email?: string;
  city?: string;

  // Source/UTM fields
  source?: string;
  utm_source?: string;
  utmSource?: string;
  utm_medium?: string;
  utm_campaign?: string;

  // Opportunity fields
  opportunity?: {
    id?: string;
    name?: string;
    monetaryValue?: number;
    pipelineId?: string;
    pipelineStageId?: string;
  };

  // Form fields may appear as customFields or custom_fields
  customFields?: Array<{ id: string; key: string; field_key?: string; value: string }> | Record<string, string>;
  custom_fields?: Record<string, string>;

  // Catch-all for any other fields
  [key: string]: unknown;
}

function normalizePhone(phone: string | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

function extractContactId(payload: GHLWebhookPayload): string {
  return (
    payload.contact?.id ||
    payload.contact_id ||
    payload.contactId ||
    payload.id ||
    ""
  );
}

function extractName(payload: GHLWebhookPayload): string {
  // Try nested contact first
  if (payload.contact?.name) return payload.contact.name;
  if (payload.contact?.firstName || payload.contact?.lastName) {
    return [payload.contact.firstName, payload.contact.lastName].filter(Boolean).join(" ");
  }

  // Try flat fields
  if (payload.full_name) return payload.full_name;
  if (payload.fullName) return payload.fullName;
  if (payload.name && typeof payload.name === "string") return payload.name;

  const firstName = payload.first_name || payload.firstName || "";
  const lastName = payload.last_name || payload.lastName || "";

  return [firstName, lastName].filter(Boolean).join(" ") || "";
}

function extractPhone(payload: GHLWebhookPayload): string {
  return payload.contact?.phone || payload.phone || "";
}

function extractCity(payload: GHLWebhookPayload): string {
  return payload.contact?.city || payload.city || "";
}

function extractSource(payload: GHLWebhookPayload): string {
  return (
    payload.contact?.source ||
    payload.source ||
    payload.utm_source ||
    payload.utmSource ||
    ""
  );
}

export async function POST(request: NextRequest) {
  let payload: GHLWebhookPayload | null = null;
  let supabase: SupabaseClient | null = null;

  try {
    // Verify webhook secret from query parameter
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");
    const expectedSecret = process.env.GHL_WEBHOOK_SECRET;

    if (expectedSecret && secret !== expectedSecret) {
      console.log("GHL Webhook: Invalid secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse payload
    payload = await request.json();

    if (!payload) {
      console.log("GHL Webhook: Empty payload");
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }

    console.log("GHL Webhook received:", JSON.stringify(payload, null, 2));

    // Initialize Supabase client
    supabase = getSupabaseClient();

    // Extract contact ID
    const contactId = extractContactId(payload);

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
      console.log("GHL Webhook: No contact ID in payload");

      // Update log to mark as error
      if (supabase) {
        await supabase
          .from("webhook_log")
          .update({ error: "No contact ID", processed: true })
          .eq("payload", payload);
      }

      return NextResponse.json({
        success: false,
        error: "No contact ID",
        logged: true
      }, { status: 400 });
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
        duplicate: true
      });
    }

    // Extract data
    const name = extractName(payload);
    const phone = extractPhone(payload);
    const phoneNormalized = normalizePhone(phone);
    const source = extractSource(payload);
    const town = extractCity(payload);

    // Map GHL source to channel
    const { data: channels } = await supabase
      .from("channels")
      .select("id, name")
      .eq("user_id", userId)
      .eq("active", true);

    let channelId: string | null = null;

    if (channels && source) {
      const sourceLower = source.toLowerCase();

      const matchedChannel = channels.find((c) => {
        const channelLower = c.name.toLowerCase();
        return (
          sourceLower.includes(channelLower) ||
          channelLower.includes(sourceLower) ||
          (sourceLower.includes("facebook") && channelLower.includes("meta")) ||
          (sourceLower.includes("meta") && channelLower.includes("meta")) ||
          (sourceLower.includes("google") && channelLower.includes("google")) ||
          (sourceLower.includes("lsa") && channelLower.includes("local service")) ||
          (sourceLower.includes("local service") && channelLower.includes("local service")) ||
          (sourceLower.includes("referral") && channelLower.includes("referral")) ||
          (sourceLower.includes("gbp") && channelLower.includes("google business"))
        );
      });

      if (matchedChannel) {
        channelId = matchedChannel.id;
      }
    }

    // Fallback channel
    if (!channelId && channels && channels.length > 0) {
      const fallbackChannel = channels.find(
        (c) => c.name.toLowerCase().includes("other") || c.name.toLowerCase().includes("ghl")
      );
      channelId = fallbackChannel?.id || channels[0].id;
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

    // Build notes from source/UTM info
    const noteParts: string[] = [];
    if (source) noteParts.push(`Source: ${source}`);
    if (payload.utm_campaign) noteParts.push(`Campaign: ${payload.utm_campaign}`);
    if (payload.utm_medium) noteParts.push(`Medium: ${payload.utm_medium}`);

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
      duplicate_phone: duplicateOf ? true : false,
    });
  } catch (error) {
    console.error("GHL Webhook error:", error);

    // Try to log the error
    if (supabase && payload) {
      try {
        await supabase.from("webhook_log").insert({
          source: "ghl",
          contact_id: extractContactId(payload) || null,
          payload: payload,
          processed: true,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } catch {
        // Ignore logging errors
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Handle GET for webhook verification
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "GHL webhook endpoint",
    usage: "POST /api/webhooks/ghl?secret=YOUR_SECRET"
  });
}
