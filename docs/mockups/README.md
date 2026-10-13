# Screen mockups

Design references for the five screens. Build the real screens in Next.js to match them; do not reuse this markup directly.

| File | Screen |
| --- | --- |
| `1-overview.html` | Overview: KPI cards, lead funnel with targets, channel table (ROAS as 13.8x), alerts |
| `2-leads.html` | Leads: add-lead form, duplicate banner, stage tabs, table with stage dropdown per row |
| `3-spend.html` | Spend: channel × month grid (synced rows read-only), shared sales & tool costs |
| `4-jobs.html` | Jobs: add-sold-job form, totals, table with editable job cost and gross profit |
| `5-settings.html` | Settings: channels, targets, services, lost reasons, costs, connections |

How to read them:

- They are written in a canvas component format: the layout is plain HTML with inline styles inside `<x-dc>`, and `{{name}}` placeholders are filled by the `renderVals()` function in the `<script>` block at the bottom of each file. `<sc-for>` repeats rows; `<sc-if>` shows one of two variants.
- All numbers and names are **sample data**. They are internally consistent (October: 112 leads, 14 jobs, $186,400 revenue, $11,700 spend), so they are good test fixtures for the Overview calculations.
- Screenshots of each screen, if present (`*.png`), show exactly how they render.
