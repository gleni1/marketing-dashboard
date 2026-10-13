# Ace Roofing Dashboard — Build Plan

Oct 11, 2026 · Glen

## What we're building

A private, single-user web dashboard for Ace Roofing NJ that shows true CAC, ROAS, avg ticket and funnel conversion by channel. Five screens: Overview, Leads, Spend, Jobs, Settings.

**Stack:** Next.js (App Router) on Vercel or Netlify · Supabase (Postgres, auth, edge functions, cron) · GHL webhook for new leads · Google Ads, Meta and LSA APIs for spend (phase 4).

```
GoHighLevel (new leads only) ──► Lead import (edge function, insert-only) ──┐
Google Ads + LSA (spend) ──┐                                                ├──► Supabase ◄──► Dashboard
Meta Ads (spend) ──────────┴──► Spend sync (nightly, 2 AM) ─────────────────┘     (leads, stage history,   (add leads, move stages,
                                                                                    jobs, spend, settings)   enter jobs + spend, read numbers)
```

Data flows in from GHL and the ad accounts; nothing flows back out to them. Import and sync arrive in phase 4. Until then, everything is typed in the dashboard.

**Ground rules that shape everything:**

- GHL only creates new leads. It never updates or moves a lead after import.
- Every stage change happens in the dashboard.
- A field edited in the dashboard is never overwritten by an import.
- Jobs are entered by hand, usually by marking a lead Sold, which pre-fills the job.
- Every lead must have a channel; Lost needs a reason; Junk never counts against close rate.
- Channel metrics are counted by the month the lead came in; revenue cards by the month the job was sold.

## Database tables

Nine tables in Supabase. Lookup tables (channels, services, lost reasons) feed every dropdown, so names can never drift between screens.

| Table | Key columns | Notes |
| --- | --- | --- |
| `channels` | id, name, spend_source (synced / manual / none), active, sort_order | Turning off hides from dropdowns, keeps history |
| `services` | id, name, active, sort_order | Roof replacement, Roof repair, Gutters, Siding |
| `lost_reasons` | id, name, active | Picked when a lead moves to Lost |
| `leads` | id, created_at, origin (ghl / manual), ghl_contact_id, name, phone, phone_normalized, town, service_id, channel_id, referrer_name, stage, next_step, lost_reason_id, notes, edited_fields (text[]), duplicate_of | `phone_normalized` (digits only) drives duplicate checks; `edited_fields` lists fields the import must skip |
| `lead_stage_history` | id, lead_id, from_stage, to_stage, changed_at | One row per stage move; gives show rate, speed to lead and sales-cycle length |
| `jobs` | id, lead_id, sold_date, customer, town, service_id, channel_id, referrer_name, status, sold_amount, job_cost, gross_profit, notes | `lead_id` ties a job to its lead and channel; cost and profit entered by hand, one fills the other |
| `spend` | id, channel_id, month (first of month), amount, source (sync / manual), updated_at | One row per channel per month; unique on (channel_id, month) |
| `shared_costs` | id, name, how, month, amount | Software, estimate time, estimate gas/mileage |
| `settings` | hourly_rate, shared_cost_mode, targets (json) | Single row |

Stage values: New, Contacted / Call again, Booked, No show, Estimate given, Follow-up, Sold, Lost, Junk. Store them as a Postgres enum so a typo can't create a tenth stage.

Job status values: Scheduled, In progress, Complete, Paid.

Row-level security: on for every table, one policy allowing only the owner's user id. Single login through Supabase magic link.

## GHL lead import

One GHL workflow (trigger: contact created, or form submitted on the funnels) sends a webhook to a Supabase edge function. The function only ever inserts; it never moves or overwrites a lead.

1. Verify the request with a shared secret in a header, so random posts are rejected.
2. If a lead with the same `ghl_contact_id` already exists, stop. Imports are insert-only.
3. Normalize the phone to digits. If another lead has the same number, insert the new one with `duplicate_of` set, which raises the Merge / Keep both banner on the Leads screen.
4. Map fields: name, phone, town (from city or address), service (from the form's service question), channel (from the UTM source or the GHL lead source). Anything that doesn't map cleanly stays empty for the owner to fill in.
5. Insert with stage New and log the first `lead_stage_history` row.

**Edits win:** when a field is changed in the dashboard, its name is added to `edited_fields`. Because imports never update existing leads, this matters mainly for a future re-sync button, which must skip any field in that list.

**Channel mapping** (set once, adjust in code): `utm_source=google` → Google Ads · `facebook` / `instagram` / `fbclid` present → Meta Ads · GHL source "LSA" → Local Services Ads · GBP call tracking number → Google Business Profile · no match → left blank and flagged.

**Backup:** a nightly job pulls contacts created in the last 48 hours through the GHL API and inserts any the webhook missed. The "Import now" button runs the same job.

## Ad spend sync

Start with every spend row typed by hand. It takes about two minutes a month, and the sync is the slowest part to set up, so it comes last.

- **Google Ads and LSA:** one Google Ads API connection covers both, since LSA campaigns live in the Google Ads account. The API needs a developer token, and Google's approval can take days, so apply early.
- **Meta Ads:** the Marketing API insights endpoint with a long-lived system-user token from Business Manager.
- **Schedule:** a Supabase cron job at 2 AM pulls the current and previous month per channel and upserts into `spend` on (channel_id, month). Re-pulling last month catches late adjustments.
- **Manual rows** (referral fees, yard signs and truck, anything new) stay editable boxes. A synced row is read-only on the Spend screen; switch its channel to "Entered by hand" in Settings to override it.
- If a sync fails, keep the last good number and show a small warning on the Spend screen instead of writing a zero.

## How every number is calculated

Revenue cards count jobs by **sold date**. Channel metrics count leads by **lead created date** and follow those leads to whatever they became, so spend is matched to the leads it bought.

| Metric | Formula | Counted by |
| --- | --- | --- |
| Revenue sold | Sum of sold amount | Sold date |
| Jobs sold | Count of jobs | Sold date |
| Avg ticket | Revenue sold ÷ jobs sold | Sold date |
| Marketing % of revenue | Channel spend ÷ revenue sold | Same months |
| CPL | Channel spend ÷ leads | Lead date |
| Junk % | Junk leads ÷ leads | Lead date |
| Channel CAC | Channel spend ÷ jobs from that channel's leads | Lead date |
| Overall CAC | (All channel spend + shared costs) ÷ jobs from all leads | Lead date |
| ROAS | Revenue from that channel's leads ÷ channel spend, shown as 13.8x | Lead date |
| Gross profit, margin | Profit ÷ sold amount, jobs with a cost entered only | Sold date |

**Funnel rates** use how far each lead got, read from `lead_stage_history`, not just its current stage. A lead counts as having reached a stage if it ever entered that stage or any later one. Stage order: New → Contacted → Booked → Estimate given → Follow-up → Sold.

| Rate | Formula |
| --- | --- |
| Contact rate | Leads that reached Contacted ÷ all leads |
| Booking rate | Reached Booked ÷ reached Contacted |
| Show rate | Showed ÷ reached Booked |
| Estimate rate | Reached Estimate given ÷ showed |
| Close rate | Sold ÷ reached Estimate given (Junk excluded) |

**Showed** has no stage of its own: a booked lead showed when its next move after Booked is anything other than No show. A booked lead with no next move yet is still pending and left out of the show rate.

**Jobs with no lead** (rare, if a job is added directly) use the job's own channel and its sold date as the lead date.

**Maturing:** leads created in the last 60 days get a "still maturing" marker, since many of their estimates are undecided.

## Build order

Four phases, each usable on its own. After phase 2 there are already real numbers; phases 3 and 4 remove typing.

**Phase 1 — Foundation**

- [ ] Create the Supabase project, the nine tables, the stage enum and row-level security
- [ ] Seed channels, services and lost reasons from the Settings mockup
- [ ] Next.js app with magic-link login and the shared header and nav
- [ ] Settings screen (it feeds every dropdown, so it comes first)

**Phase 2 — Manual tracking**

- [ ] Leads screen: add lead, stage dropdown writing to stage history, lost reason, edit
- [ ] Mark Sold opens the job form pre-filled from the lead
- [ ] Jobs screen: add, edit, cost and profit filling each other
- [ ] Spend screen with every row typed by hand
- [ ] Enter October's leads, jobs and spend by hand to test

**Phase 3 — Overview**

- [ ] SQL views for each formula above, so the screen only reads results
- [ ] KPI cards, funnel strip, channel table, date range
- [ ] Targets from Settings colour the numbers; alerts list what misses
- [ ] Check the Overview against a month that can be counted by hand

**Phase 4 — Automation**

- [ ] GHL webhook edge function with duplicate check, plus the nightly backup import
- [ ] Apply for the Google Ads API developer token (start this in phase 1, since approval takes time)
- [ ] Nightly spend sync for Google Ads, LSA and Meta

## Open decisions and later ideas

**Still to decide**

- Hourly rate for estimate time ($75 is a placeholder).
- Shared costs: overall CAC only (the default) or split across channels by lead count.
- Referral fees are counted as Referral channel spend, not job cost. Confirm, or move them to job cost.
- Targets are starting guesses; revisit after two months of real data.
- Vercel or Netlify for hosting; either works with this stack.

**Later, once there's data**

- A trend line for CAC and close rate by month, after three months.
- Gross profit and margin per channel on the Overview, once most jobs have costs.
- A `referrers` table so the referral portal can reuse the referrer names already on leads and jobs.
- A phone-sized quick-add lead form for calls taken on a roof.
