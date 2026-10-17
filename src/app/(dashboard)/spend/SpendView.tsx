"use client";

import { useState, useTransition, useEffect } from "react";
import type { Channel, Spend, SharedCost } from "@/lib/types";
import { saveSpend, saveSharedCosts } from "./actions";
import { useChannels, useSpend, useSharedCosts } from "@/lib/swr/hooks";
import { PageSkeleton } from "@/components/PageSkeleton";

function formatCurrency(amount: number): string {
  return "$" + amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function parseCurrency(value: string): number {
  const num = parseFloat(value.replace(/[$,]/g, ""));
  return isNaN(num) ? 0 : num;
}

function getMonthsRange(offset: number = 0): { months: Date[]; label: string } {
  const now = new Date();
  const months: Date[] = [];

  // Show 6 months ending with current month, shifted by offset (each offset = 6 months)
  const baseOffset = offset * 6;
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i - baseOffset, 1);
    months.push(d);
  }

  const firstMonth = months[0].toLocaleDateString("en-US", { month: "short" });
  const lastMonth = months[5].toLocaleDateString("en-US", { month: "short" });

  // Show year range if spans multiple years
  const firstYear = months[0].getFullYear();
  const lastYear = months[5].getFullYear();
  const yearLabel = firstYear === lastYear
    ? `${lastYear}`
    : `${firstYear}-${lastYear}`;

  return {
    months,
    label: `${firstMonth} - ${lastMonth} ${yearLabel}`,
  };
}

function formatMonthKey(date: Date): string {
  // Use local date to avoid timezone issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short" });
}

export function SpendView() {
  // Fetch data using SWR (cached across navigations)
  const { data: channels = [], isLoading: channelsLoading } = useChannels();
  const { data: spend = [], isLoading: spendLoading, mutate: mutateSpend } = useSpend();
  const { data: sharedCosts = [], isLoading: sharedCostsLoading, mutate: mutateSharedCosts } = useSharedCosts();

  const isLoading = channelsLoading || spendLoading || sharedCostsLoading;

  // Show skeleton while loading (only on first load - SWR will show cached data on subsequent visits)
  if (isLoading && channels.length === 0) {
    return <PageSkeleton />;
  }

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [periodOffset, setPeriodOffset] = useState(0);

  const { months, label: monthsLabel } = getMonthsRange(periodOffset);

  // Default shared cost categories
  const defaultSharedCosts = [
    { name: "Software (GHL, call tracking)", how: "Monthly subscriptions" },
    { name: "Estimate time", how: "Hours on estimates × $75/hr" },
    { name: "Gas & mileage for estimates", how: "Estimate trips only" },
  ];

  // Helper to build spend data for current months
  const buildSpendData = (currentMonths: Date[]) => {
    const data: Record<string, Record<string, number>> = {};
    channels.forEach((ch) => {
      data[ch.id] = {};
      currentMonths.forEach((m) => {
        const monthKey = formatMonthKey(m);
        const existing = spend.find(
          (s) => s.channel_id === ch.id && s.month === monthKey
        );
        data[ch.id][monthKey] = existing?.amount || 0;
      });
    });
    return data;
  };

  // Helper to build shared costs data for current months
  const buildSharedData = (currentMonths: Date[]) => {
    return defaultSharedCosts.map((sc) => {
      const values: Record<string, number> = {};
      currentMonths.forEach((m) => {
        const monthKey = formatMonthKey(m);
        const existing = sharedCosts.find(
          (c) => c.name === sc.name && c.month === monthKey
        );
        values[monthKey] = existing?.amount || 0;
      });
      return { name: sc.name, how: sc.how, values };
    });
  };

  // Track edits in state
  const [spendData, setSpendData] = useState(() => buildSpendData(months));
  const [sharedData, setSharedData] = useState(() => buildSharedData(months));

  // Reset data when period changes
  useEffect(() => {
    const newMonths = getMonthsRange(periodOffset).months;
    setSpendData(buildSpendData(newMonths));
    setSharedData(buildSharedData(newMonths));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodOffset]);

  const handleSpendChange = (
    channelId: string,
    monthKey: string,
    value: string
  ) => {
    setSpendData((prev) => ({
      ...prev,
      [channelId]: {
        ...prev[channelId],
        [monthKey]: parseCurrency(value),
      },
    }));
  };

  const handleSharedChange = (
    index: number,
    monthKey: string,
    value: string
  ) => {
    setSharedData((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, values: { ...item.values, [monthKey]: parseCurrency(value) } }
          : item
      )
    );
  };

  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      // Prepare spend data for saving
      const spendToSave: Array<{
        channel_id: string;
        month: string;
        amount: number;
      }> = [];

      Object.entries(spendData).forEach(([channelId, monthData]) => {
        const channel = channels.find((c) => c.id === channelId);
        // Only save manual spend (not synced)
        if (channel?.spend_source !== "synced") {
          Object.entries(monthData).forEach(([month, amount]) => {
            spendToSave.push({ channel_id: channelId, month, amount });
          });
        }
      });

      const spendResult = await saveSpend(spendToSave);

      // Prepare shared costs for saving
      const sharedToSave: Array<{
        name: string;
        how: string;
        month: string;
        amount: number;
      }> = [];

      sharedData.forEach((item) => {
        Object.entries(item.values).forEach(([month, amount]) => {
          sharedToSave.push({
            name: item.name,
            how: item.how,
            month,
            amount,
          });
        });
      });

      const sharedResult = await saveSharedCosts(sharedToSave);

      if (spendResult.error || sharedResult.error) {
        setMessage({
          type: "error",
          text: spendResult.error || sharedResult.error || "Error saving",
        });
      } else {
        // Refresh SWR cache
        mutateSpend();
        mutateSharedCosts();
        setMessage({ type: "success", text: "Changes saved!" });
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  // Calculate totals
  const getChannelTotal = (channelId: string) => {
    return Object.values(spendData[channelId] || {}).reduce(
      (sum, v) => sum + v,
      0
    );
  };

  const getMonthTotal = (monthKey: string) => {
    return Object.values(spendData).reduce(
      (sum, channelData) => sum + (channelData[monthKey] || 0),
      0
    );
  };

  const grandTotal = Object.values(spendData).reduce(
    (sum, channelData) =>
      sum + Object.values(channelData).reduce((s, v) => s + v, 0),
    0
  );

  const getSharedTotal = (index: number) => {
    return Object.values(sharedData[index]?.values || {}).reduce(
      (sum, v) => sum + v,
      0
    );
  };

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-archivo font-extrabold text-[34px] tracking-tight">
            Spend
          </h1>
          <p className="text-muted">
            Type one number per channel per month. Synced rows fill themselves.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex bg-white border border-[#DCD8D0] rounded-lg p-1">
            <button
              type="button"
              onClick={() => setPeriodOffset((prev) => prev + 1)}
              className="px-3.5 py-2.5 min-h-[44px] rounded-md hover:bg-ground"
              aria-label="Previous months"
            >
              &lsaquo;
            </button>
            <span className="font-semibold px-2 py-2.5 flex items-center min-w-[140px] justify-center">
              {monthsLabel}
            </span>
            <button
              type="button"
              onClick={() => setPeriodOffset((prev) => Math.max(0, prev - 1))}
              disabled={periodOffset === 0}
              className="px-3.5 py-2.5 min-h-[44px] rounded-md hover:bg-ground disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next months"
            >
              &rsaquo;
            </button>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="bg-accent text-white font-semibold px-5 py-2.5 rounded-lg min-h-[44px] hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm font-medium ${
            message.type === "success"
              ? "bg-on-target-bg text-on-target"
              : "bg-below-target-bg text-below-target"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Channel Spend Table */}
      <section className="bg-white border border-border rounded-xl p-6 flex flex-col gap-3.5">
        <div className="flex flex-wrap justify-between items-baseline gap-2">
          <h2 className="font-archivo font-bold text-xl">Channel spend</h2>
          <span className="text-sm text-muted">
            Counts toward each channel&apos;s CAC and ROAS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse tabular-nums">
            <thead>
              <tr className="text-right text-xs uppercase tracking-wider text-muted">
                <th className="text-left px-3 py-2.5 border-b-2 border-ink">
                  Channel
                </th>
                <th className="text-left px-3 py-2.5 border-b-2 border-ink">
                  Source
                </th>
                {months.map((m) => (
                  <th
                    key={formatMonthKey(m)}
                    className="px-3 py-2.5 border-b-2 border-ink"
                  >
                    {formatMonthLabel(m)}
                  </th>
                ))}
                <th className="px-3 py-2.5 border-b-2 border-ink">6-mo total</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => {
                const isSynced = channel.spend_source === "synced";
                return (
                  <tr key={channel.id} className="border-b border-border">
                    <th className="text-left px-3 py-2.5 font-semibold">
                      {channel.name}
                    </th>
                    <td className="px-3 py-2.5">
                      {isSynced ? (
                        <span className="text-sm font-semibold text-on-target bg-on-target-bg px-2 py-1 rounded-md">
                          Synced
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-muted bg-ground px-2 py-1 rounded-md">
                          Manual
                        </span>
                      )}
                    </td>
                    {months.map((m) => {
                      const monthKey = formatMonthKey(m);
                      const value = spendData[channel.id]?.[monthKey] || 0;
                      return (
                        <td
                          key={monthKey}
                          className="px-2 py-1.5 text-right"
                        >
                          {isSynced ? (
                            <span className="inline-block px-2.5 py-2.5 text-[#3D4248]">
                              {formatCurrency(value)}
                            </span>
                          ) : (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={
                                value > 0 ? formatCurrency(value) : ""
                              }
                              onChange={(e) =>
                                handleSpendChange(
                                  channel.id,
                                  monthKey,
                                  e.target.value
                                )
                              }
                              placeholder="$0"
                              aria-label={`${channel.name} ${formatMonthLabel(m)} spend`}
                              className="w-24 text-right px-2.5 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right font-bold">
                      {formatCurrency(getChannelTotal(channel.id))}
                    </td>
                  </tr>
                );
              })}
              {/* Channel totals row */}
              <tr className="bg-ground font-bold">
                <th className="text-left px-3 py-3.5">Channel total</th>
                <td className="px-3 py-3.5"></td>
                {months.map((m) => {
                  const monthKey = formatMonthKey(m);
                  return (
                    <td key={monthKey} className="px-3 py-3.5 text-right">
                      {formatCurrency(getMonthTotal(monthKey))}
                    </td>
                  );
                })}
                <td className="px-3 py-3.5 text-right">
                  {formatCurrency(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Shared Costs Table */}
      <section className="bg-white border border-border rounded-xl p-6 flex flex-col gap-3.5">
        <div className="flex flex-wrap justify-between items-baseline gap-2">
          <h2 className="font-archivo font-bold text-xl">
            Shared sales & tool costs
          </h2>
          <span className="text-sm text-muted">
            Not tied to one channel · included in overall CAC only
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse tabular-nums">
            <thead>
              <tr className="text-right text-xs uppercase tracking-wider text-muted">
                <th className="text-left px-3 py-2.5 border-b-2 border-ink">
                  Cost
                </th>
                <th className="text-left px-3 py-2.5 border-b-2 border-ink">
                  How it&apos;s figured
                </th>
                {months.map((m) => (
                  <th
                    key={formatMonthKey(m)}
                    className="px-3 py-2.5 border-b-2 border-ink"
                  >
                    {formatMonthLabel(m)}
                  </th>
                ))}
                <th className="px-3 py-2.5 border-b-2 border-ink">6-mo total</th>
              </tr>
            </thead>
            <tbody>
              {sharedData.map((item, index) => (
                <tr key={item.name} className="border-b border-border">
                  <th className="text-left px-3 py-2.5 font-semibold">
                    {item.name}
                  </th>
                  <td className="px-3 py-2.5 text-sm text-muted">{item.how}</td>
                  {months.map((m) => {
                    const monthKey = formatMonthKey(m);
                    const value = item.values[monthKey] || 0;
                    return (
                      <td key={monthKey} className="px-2 py-1.5 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={value > 0 ? formatCurrency(value) : ""}
                          onChange={(e) =>
                            handleSharedChange(index, monthKey, e.target.value)
                          }
                          placeholder="$0"
                          aria-label={`${item.name} ${formatMonthLabel(m)} cost`}
                          className="w-24 text-right px-2.5 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right font-bold">
                    {formatCurrency(getSharedTotal(index))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Info Cards */}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3.5">
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="font-bold">Synced rows</span>
          <span className="text-muted text-sm">
            Google Ads, Meta and LSA pull nightly from their ad accounts. Last
            sync: today, 2:00 AM.
          </span>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="font-bold">Referral fees</span>
          <span className="text-muted text-sm">
            Enter in the month you paid them. Later this row can fill from
            referral payouts automatically.
          </span>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="font-bold">Two CAC numbers</span>
          <span className="text-muted text-sm">
            Channel CAC uses channel spend only. Overall CAC on the Overview
            adds the shared costs for the true, fully loaded figure.
          </span>
        </div>
      </section>
    </>
  );
}
