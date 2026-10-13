# Ace Roofing NJ — Marketing Dashboard

Private, single-user dashboard that tracks leads, sold jobs and marketing spend for Ace Roofing NJ (one business only; no multi-brand support), and shows CAC, ROAS, avg ticket and funnel conversion by channel.

Full spec: `docs/build-plan.md`. Screen designs: `docs/mockups/` (read its README first). Build one phase at a time and tick the checklist in the build plan as items are finished.

## Stack

- Next.js (App Router, TypeScript) + Supabase (Postgres, auth, edge functions, cron)
- One user. Supabase magic-link login. Row-level security on every table, policy = owner's user id only.
- Keep it simple: server components and server actions; no extra state library unless it's needed.

## Rules that must never be broken

1. **GHL only inserts new leads.** The import never updates, moves or deletes an existing lead.
2. **Stages move only in the dashboard.** Every stage change writes a row to `lead_stage_history`.
3. **Edits win.** A field edited in the dashboard is added to `leads.edited_fields` and is never overwritten by any import or re-sync.
4. **Every lead needs a channel.** Lost requires a lost reason. Junk never counts against close rate.
5. **Jobs are entered by hand**, normally by marking a lead Sold, which opens the job form pre-filled from the lead and links `jobs.lead_id`.
6. **Job cost and gross profit are both manual**: entering one fills the other (sold amount − cost = profit). Margin is always calculated.
7. **Dropdowns come from lookup tables** (`channels`, `services`, `lost_reasons`), never hard-coded lists.

## How numbers are counted

- Revenue, jobs sold, avg ticket, margin → by **job sold date**.
- CPL, junk %, CAC, ROAS, funnel rates → by **lead created date** (follow those leads to what they became).
- Funnel rates use the furthest stage a lead ever reached, from `lead_stage_history`.
- All Overview math lives in **SQL views**; the UI only reads results. Formulas are in `docs/build-plan.md`.
- ROAS is displayed as a multiple, e.g. `13.8x`. Money as `$13,314` (no cents).

## Look and feel

Match the mockups: warm off-white ground `#F4F2EE`, ink `#1A1D21`, accent `#C2410C`, Archivo for headings and numbers, Public Sans for body. On-target = blue (`#1D4E89` on `#E3ECF7`), below target = orange (`#9A3412` on `#FDEBDD`); never red/green alone. Tables scroll horizontally on phones; touch targets at least 44px.

## Working style

- Plan before coding each phase and wait for approval.
- Small commits, one per finished checklist item or screen.
- Ask before adding a dependency or changing the database schema beyond the build plan.
