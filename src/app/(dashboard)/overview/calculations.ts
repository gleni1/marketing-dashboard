import type { Lead, Job, Spend, Channel, Settings, LeadStageHistory } from "@/lib/types";

// Lead with nested jobs from Supabase join
interface LeadWithJobs extends Lead {
  jobs: Array<{ id: string; sold_amount: number | null }>;
}

export type Period = "this-month" | "last-30" | "quarter" | "ytd";

// Helper to format date as YYYY-MM-DD in local timezone
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Helper to get date range based on period
export function getDateRange(period: Period): { start: string; end: string; label: string; spendMonths: string[] } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  let startDate: Date;
  let endDate: Date;
  let label: string;
  let spendMonths: string[] = [];

  switch (period) {
    case "last-30": {
      endDate = now;
      startDate = new Date(year, month, now.getDate() - 29);
      label = "Last 30 days";
      const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      for (let d = new Date(startMonth); d <= endMonth; d.setMonth(d.getMonth() + 1)) {
        spendMonths.push(formatLocalDate(new Date(d.getFullYear(), d.getMonth(), 1)));
      }
      break;
    }
    case "quarter": {
      const quarterStart = Math.floor(month / 3) * 3;
      startDate = new Date(year, quarterStart, 1);
      endDate = new Date(year, quarterStart + 3, 0);
      const quarterNum = Math.floor(month / 3) + 1;
      label = `Q${quarterNum} ${year}`;
      for (let m = quarterStart; m < quarterStart + 3; m++) {
        spendMonths.push(formatLocalDate(new Date(year, m, 1)));
      }
      break;
    }
    case "ytd": {
      startDate = new Date(year, 0, 1);
      endDate = now;
      label = `${year} YTD`;
      for (let m = 0; m <= month; m++) {
        spendMonths.push(formatLocalDate(new Date(year, m, 1)));
      }
      break;
    }
    case "this-month":
    default: {
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0);
      label = startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      spendMonths = [formatLocalDate(startDate)];
      break;
    }
  }

  return {
    start: formatLocalDate(startDate),
    end: formatLocalDate(endDate),
    label,
    spendMonths,
  };
}

export interface KpiData {
  label: string;
  value: number | null;
  format: "currency" | "number" | "percent";
  target?: number;
  targetDirection?: "under" | "atleast";
  basis: string;
}

export interface FunnelData {
  stage: string;
  count: number;
  rate: number | null;
  target?: number;
  isFirst?: boolean;
  hint: string;
}

export interface ChannelMetric {
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

export interface Totals {
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

export interface OverviewMetrics {
  kpiData: KpiData[];
  funnelData: FunnelData[];
  channelMetrics: ChannelMetric[];
  alerts: string[];
  totals: Totals;
}

export function calculateOverviewMetrics(
  settings: Settings | null,
  channels: Channel[],
  leads: LeadWithJobs[],
  jobs: Job[],
  spend: Spend[],
  stageHistory: LeadStageHistory[]
): OverviewMetrics {
  // Build stage history lookup
  const stageHistoryByLead = stageHistory.reduce<Record<string, LeadStageHistory[]>>((acc, sh) => {
    if (!acc[sh.lead_id]) acc[sh.lead_id] = [];
    acc[sh.lead_id].push(sh);
    return acc;
  }, {});

  // Calculate funnel progress for each lead
  const stageOrder = {
    new: 1,
    contacted: 2,
    call_again: 2,
    booked: 3,
    no_show: 3,
    estimate_given: 4,
    follow_up: 4,
    sold: 5,
    lost: 0,
    junk: 0,
  };

  const leadProgress = leads.map((lead) => {
    const history = stageHistoryByLead[lead.id] || [];
    const allStages = [lead.stage, ...history.map((h) => h.to_stage)];
    const maxRank = Math.max(...allStages.map((s) => stageOrder[s as keyof typeof stageOrder] || 0));

    const wasBooked = maxRank >= 3;
    const hadNoShow = allStages.includes("no_show");
    const showed = wasBooked && !hadNoShow;

    return {
      ...lead,
      maxRank,
      reachedContacted: maxRank >= 2,
      reachedBooked: maxRank >= 3,
      showed,
      reachedEstimate: maxRank >= 4,
      reachedSold: maxRank >= 5,
      isJunk: lead.stage === "junk",
    };
  });

  // Overall funnel metrics
  const totalLeads = leadProgress.length;
  const contacted = leadProgress.filter((l) => l.reachedContacted).length;
  const booked = leadProgress.filter((l) => l.reachedBooked).length;
  const showed = leadProgress.filter((l) => l.showed).length;
  const estimated = leadProgress.filter((l) => l.reachedEstimate).length;
  const sold = leadProgress.filter((l) => l.reachedSold).length;
  const junk = leadProgress.filter((l) => l.isJunk).length;

  // Revenue metrics (by job sold date)
  const totalRevenue = jobs.reduce((sum, j) => sum + (j.sold_amount || 0), 0);
  const jobsSold = jobs.length;
  const avgTicket = jobsSold > 0 ? totalRevenue / jobsSold : 0;

  // Spend metrics
  const totalSpend = spend.reduce((sum, s) => sum + (s.amount || 0), 0);

  // Channel metrics
  const channelMetrics = channels.map((channel) => {
    const channelLeads = leadProgress.filter((l) => l.channel_id === channel.id);
    const channelSpend = spend.find((s) => s.channel_id === channel.id)?.amount || 0;

    const channelJobs = channelLeads.reduce((acc, lead) => {
      const leadJobs = lead.jobs || [];
      return acc + leadJobs.length;
    }, 0);

    const channelRevenue = channelLeads.reduce((acc, lead) => {
      const leadJobs = lead.jobs || [];
      return acc + leadJobs.reduce((sum, j) => sum + (j.sold_amount || 0), 0);
    }, 0);

    const leadCount = channelLeads.length;
    const channelContacted = channelLeads.filter((l) => l.reachedContacted).length;
    const channelBooked = channelLeads.filter((l) => l.reachedBooked).length;
    const channelShowed = channelLeads.filter((l) => l.showed).length;
    const channelEstimated = channelLeads.filter((l) => l.reachedEstimate).length;
    const channelSold = channelLeads.filter((l) => l.reachedSold).length;
    const channelJunk = channelLeads.filter((l) => l.isJunk).length;

    return {
      id: channel.id,
      name: channel.name,
      leads: leadCount,
      contacted: channelContacted,
      booked: channelBooked,
      showed: channelShowed,
      estimated: channelEstimated,
      sold: channelSold,
      junk: channelJunk,
      spend: channelSpend,
      jobs: channelJobs,
      revenue: channelRevenue,
      cpl: leadCount > 0 ? channelSpend / leadCount : null,
      junkPct: leadCount > 0 ? (channelJunk / leadCount) * 100 : 0,
      closeRate: channelEstimated > 0 ? (channelSold / channelEstimated) * 100 : 0,
      cac: channelJobs > 0 ? channelSpend / channelJobs : null,
      roas: channelSpend > 0 ? channelRevenue / channelSpend : null,
    };
  }).filter((c) => c.leads > 0 || c.spend > 0);

  channelMetrics.sort((a, b) => b.revenue - a.revenue);

  // Calculate rates
  const contactRate = totalLeads > 0 ? (contacted / totalLeads) * 100 : 0;
  const bookingRate = contacted > 0 ? (booked / contacted) * 100 : 0;
  const showRate = booked > 0 ? (showed / booked) * 100 : 0;
  const estimateRate = showed > 0 ? (estimated / showed) * 100 : 0;
  const closeRate = estimated > 0 ? (sold / estimated) * 100 : 0;
  const junkPct = totalLeads > 0 ? (junk / totalLeads) * 100 : 0;
  const marketingPct = totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : 0;
  const cac = jobsSold > 0 ? totalSpend / jobsSold : null;
  const cpl = totalLeads > 0 ? totalSpend / totalLeads : null;

  // Build funnel data
  const funnelData: FunnelData[] = [
    {
      stage: "Leads",
      count: totalLeads,
      rate: null,
      isFirst: true,
      hint: "Excludes nothing yet",
    },
    {
      stage: "Contacted",
      count: contacted,
      rate: contactRate,
      target: settings?.targets?.contact_rate || 90,
      hint: "Speed to lead / follow-up",
    },
    {
      stage: "Booked",
      count: booked,
      rate: bookingRate,
      target: settings?.targets?.booking_rate || 50,
      hint: "Phone and intake",
    },
    {
      stage: "Showed",
      count: showed,
      rate: showRate,
      target: settings?.targets?.show_rate || 80,
      hint: "Confirmations / lead quality",
    },
    {
      stage: "Estimated",
      count: estimated,
      rate: estimateRate,
      target: settings?.targets?.estimate_rate || 85,
      hint: "Inspection to quote",
    },
    {
      stage: "Sold",
      count: sold,
      rate: closeRate,
      target: settings?.targets?.close_rate || 35,
      hint: "Sales and pricing",
    },
  ];

  // KPI data
  const kpiData: KpiData[] = [
    {
      label: "Revenue sold",
      value: totalRevenue,
      format: "currency",
      basis: "By sold date",
    },
    {
      label: "Jobs sold",
      value: jobsSold,
      format: "number",
      basis: "By sold date",
    },
    {
      label: "Avg ticket",
      value: avgTicket,
      format: "currency",
      basis: "Revenue ÷ jobs sold",
    },
    {
      label: "CAC",
      value: cac,
      format: "currency",
      target: settings?.targets?.cac || 1200,
      targetDirection: "under",
      basis: "Spend ÷ jobs sold, by lead date",
    },
    {
      label: "Marketing % of rev",
      value: marketingPct,
      format: "percent",
      target: settings?.targets?.marketing_pct || 8,
      targetDirection: "under",
      basis: "Spend ÷ revenue sold",
    },
    {
      label: "Close rate",
      value: closeRate,
      format: "percent",
      target: settings?.targets?.close_rate || 35,
      targetDirection: "atleast",
      basis: "Sold ÷ estimates given",
    },
  ];

  // Generate alerts
  const alerts: string[] = [];
  const targets = settings?.targets;

  if (targets) {
    if (contactRate < targets.contact_rate) {
      alerts.push(
        `Contact rate ${contactRate.toFixed(0)}% (target ${targets.contact_rate}%). ${totalLeads - contacted} leads never reached; check speed to lead.`
      );
    }
    if (junkPct > targets.junk_pct) {
      alerts.push(
        `Overall junk leads at ${junkPct.toFixed(0)}% (target under ${targets.junk_pct}%). Check targeting and lead forms.`
      );
    }

    channelMetrics.forEach((ch) => {
      if (ch.junkPct > targets.junk_pct) {
        alerts.push(
          `${ch.name} junk leads at ${ch.junkPct.toFixed(0)}% (target under ${targets.junk_pct}%). Check targeting and the lead form.`
        );
      }
    });
  }

  return {
    kpiData,
    funnelData,
    channelMetrics,
    alerts,
    totals: {
      spend: totalSpend,
      leads: totalLeads,
      cpl,
      junkPct,
      sold: jobsSold,
      closeRate,
      revenue: totalRevenue,
      cac,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
    },
  };
}
