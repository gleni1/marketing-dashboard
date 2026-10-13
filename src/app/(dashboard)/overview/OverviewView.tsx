"use client";

import Link from "next/link";

interface KpiData {
  label: string;
  value: number | null;
  format: "currency" | "number" | "percent";
  target?: number;
  targetDirection?: "under" | "atleast";
  basis: string;
}

interface FunnelData {
  stage: string;
  count: number;
  rate: number | null;
  target?: number;
  isFirst?: boolean;
  hint: string;
}

interface ChannelMetric {
  id: string;
  name: string;
  leads: number;
  junk: number;
  sold: number;
  spend: number;
  jobs: number;
  revenue: number;
  cpl: number | null;
  junkPct: number;
  closeRate: number;
  cac: number | null;
  roas: number | null;
}

interface Totals {
  spend: number;
  leads: number;
  cpl: number | null;
  junkPct: number;
  sold: number;
  closeRate: number;
  revenue: number;
  cac: number | null;
  roas: number | null;
}

type Period = "this-month" | "last-30" | "quarter" | "ytd";

interface OverviewViewProps {
  monthLabel: string;
  period: Period;
  kpiData: KpiData[];
  funnelData: FunnelData[];
  channelMetrics: ChannelMetric[];
  alerts: string[];
  totals: Totals;
}

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(0) + "%";
}

function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US");
}

function formatRoas(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(1) + "x";
}

function formatValue(
  value: number | null,
  format: "currency" | "number" | "percent"
): string {
  switch (format) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    default:
      return formatNumber(value);
  }
}

const periodOptions: { value: Period; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-30", label: "Last 30 days" },
  { value: "quarter", label: "Quarter" },
  { value: "ytd", label: "YTD" },
];

export function OverviewView({
  monthLabel,
  period,
  kpiData,
  funnelData,
  channelMetrics,
  alerts,
  totals,
}: OverviewViewProps) {
  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-archivo font-extrabold text-[34px] tracking-tight">
            {monthLabel}
          </h1>
          <p className="text-muted">
            Channel numbers by lead created date; revenue by job sold date
          </p>
        </div>
        <div className="flex bg-white border border-[#DCD8D0] rounded-lg p-1">
          {periodOptions.map((opt) => (
            <Link
              key={opt.value}
              href={opt.value === "this-month" ? "/overview" : `/overview?period=${opt.value}`}
              className={`px-4 py-2.5 rounded-md min-h-[44px] flex items-center ${
                period === opt.value
                  ? "font-semibold bg-ink text-white"
                  : "hover:bg-ground"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section className="bg-below-target-bg border border-[#F3C9A8] rounded-xl px-5 py-3.5 flex flex-col gap-1.5">
          {alerts.map((alert, i) => (
            <div key={i} className="flex gap-2.5 items-baseline text-[#7C2D12]">
              <span className="font-bold flex-none">Needs attention</span>
              <span>{alert}</span>
            </div>
          ))}
        </section>
      )}

      {/* KPI Cards */}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
        {kpiData.map((kpi) => {
          const meetsTarget =
            !kpi.target ||
            (kpi.targetDirection === "under"
              ? (kpi.value || 0) <= kpi.target
              : (kpi.value || 0) >= kpi.target);

          return (
            <div
              key={kpi.label}
              className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5"
            >
              <span className="text-sm font-semibold text-muted uppercase tracking-wider">
                {kpi.label}
              </span>
              <span className="font-archivo font-bold text-[32px] leading-tight tabular-nums">
                {formatValue(kpi.value, kpi.format)}
              </span>
              {kpi.target && (
                <span
                  className={`text-sm font-semibold ${
                    meetsTarget ? "text-on-target" : "text-below-target"
                  }`}
                >
                  {meetsTarget ? "On target" : "Below target"} (
                  {kpi.targetDirection === "under" ? "under " : ""}
                  {kpi.format === "currency"
                    ? formatCurrency(kpi.target)
                    : kpi.target + "%"}
                  )
                </span>
              )}
              <span className="text-xs text-[#6B7077]">{kpi.basis}</span>
            </div>
          );
        })}
      </section>

      {/* Lead Funnel */}
      <section className="bg-white border border-border rounded-xl p-6 flex flex-col gap-4">
        <div className="flex flex-wrap justify-between items-baseline gap-2">
          <h2 className="font-archivo font-bold text-xl">Lead funnel</h2>
          <span className="text-sm text-muted">
            Each % is conversion from the stage before, checked against your
            target
          </span>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
          {funnelData.map((stage) => {
            const meetsTarget =
              stage.isFirst ||
              !stage.target ||
              (stage.rate || 0) >= stage.target;

            return (
              <div
                key={stage.stage}
                className="rounded-lg bg-ground p-4 flex flex-col gap-1"
              >
                <span className="text-sm font-semibold text-muted">
                  {stage.stage}
                </span>
                <span className="font-archivo font-bold text-[30px] leading-tight tabular-nums">
                  {stage.count}
                </span>
                {stage.isFirst ? (
                  <span className="text-sm text-muted py-1">All sources</span>
                ) : (
                  <span
                    className={`self-start text-sm font-semibold px-2 py-1 rounded-md ${
                      meetsTarget
                        ? "text-on-target bg-on-target-bg"
                        : "text-below-target bg-below-target-bg font-bold"
                    }`}
                  >
                    {formatPercent(stage.rate)} ·{" "}
                    {meetsTarget
                      ? `on target (${stage.target}%)`
                      : `below ${stage.target}%`}
                  </span>
                )}
                <span className="text-xs text-[#6B7077]">{stage.hint}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Channel Table */}
      <section className="bg-white border border-border rounded-xl p-6 flex flex-col gap-3.5">
        <div className="flex flex-wrap justify-between items-baseline gap-2">
          <h2 className="font-archivo font-bold text-xl">By channel</h2>
          <span className="text-sm text-muted">
            Sorted by revenue · ROAS shown as multiple (e.g. 13.8x)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse tabular-nums">
            <thead>
              <tr className="text-right text-xs uppercase tracking-wider text-muted">
                <th className="text-left px-3 py-2.5 border-b-2 border-ink">
                  Channel
                </th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Spend</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Leads</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">CPL</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Junk</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Sold</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Close</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Revenue</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">CAC</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {channelMetrics.map((ch) => (
                <tr
                  key={ch.id}
                  className="text-right border-b border-border hover:bg-ground/50 cursor-pointer"
                >
                  <th className="text-left px-3 py-3.5 font-semibold">
                    {ch.name}
                  </th>
                  <td className="px-3 py-3.5">{formatCurrency(ch.spend)}</td>
                  <td className="px-3 py-3.5">{ch.leads}</td>
                  <td className="px-3 py-3.5">{formatCurrency(ch.cpl)}</td>
                  <td className="px-3 py-3.5">{formatPercent(ch.junkPct)}</td>
                  <td className="px-3 py-3.5">{ch.jobs}</td>
                  <td className="px-3 py-3.5">{formatPercent(ch.closeRate)}</td>
                  <td className="px-3 py-3.5 font-semibold">
                    {formatCurrency(ch.revenue)}
                  </td>
                  <td className="px-3 py-3.5">{formatCurrency(ch.cac)}</td>
                  <td className="px-3 py-3.5">{formatRoas(ch.roas)}</td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="text-right font-bold bg-ground">
                <th className="text-left px-3 py-3.5">Total</th>
                <td className="px-3 py-3.5">{formatCurrency(totals.spend)}</td>
                <td className="px-3 py-3.5">{totals.leads}</td>
                <td className="px-3 py-3.5">{formatCurrency(totals.cpl)}</td>
                <td className="px-3 py-3.5">{formatPercent(totals.junkPct)}</td>
                <td className="px-3 py-3.5">{totals.sold}</td>
                <td className="px-3 py-3.5">
                  {formatPercent(totals.closeRate)}
                </td>
                <td className="px-3 py-3.5">{formatCurrency(totals.revenue)}</td>
                <td className="px-3 py-3.5">{formatCurrency(totals.cac)}</td>
                <td className="px-3 py-3.5">{formatRoas(totals.roas)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-sm text-muted max-w-3xl">
        Leads from the last 60 days are still maturing, so recent close rates
        and CAC will look worse until those estimates are decided. Channel
        numbers are counted by the month the lead came in; revenue cards by the
        month the job was sold.
      </p>
    </>
  );
}
