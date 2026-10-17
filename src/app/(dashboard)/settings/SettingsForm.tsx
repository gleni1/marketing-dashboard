"use client";

import { useState, useTransition, useEffect } from "react";
import type {
  Channel,
  Service,
  LostReason,
  Settings,
  ChannelSpendSource,
  SharedCostMode,
  Targets,
} from "@/lib/types";
import {
  saveChannels,
  saveServices,
  saveLostReasons,
  saveSettings,
} from "./actions";
import {
  useChannels,
  useServices,
  useLostReasons,
  useSettings,
  invalidateChannels,
  invalidateServices,
  invalidateLostReasons,
  invalidateSettings,
} from "@/lib/swr/hooks";
import { PageSkeleton } from "@/components/PageSkeleton";

type ChannelFormData = {
  id?: string;
  name: string;
  spend_source: ChannelSpendSource;
  active: boolean;
  sort_order: number;
};

type ServiceFormData = {
  id?: string;
  name: string;
  sort_order: number;
};

type LostReasonFormData = {
  id?: string;
  name: string;
};

const defaultTargets: Targets = {
  contact_rate: 90,
  booking_rate: 50,
  show_rate: 80,
  estimate_rate: 85,
  close_rate: 35,
  junk_pct: 25,
  marketing_pct: 8,
  cac: 1200,
};

const targetConfig = [
  {
    key: "contact_rate" as const,
    label: "Contact rate",
    help: "Leads reached",
    dir: "at least",
    suffix: "%",
  },
  {
    key: "booking_rate" as const,
    label: "Booking rate",
    help: "Contacted \u2192 booked",
    dir: "at least",
    suffix: "%",
  },
  {
    key: "show_rate" as const,
    label: "Show rate",
    help: "Booked \u2192 showed",
    dir: "at least",
    suffix: "%",
  },
  {
    key: "estimate_rate" as const,
    label: "Estimate rate",
    help: "Showed \u2192 estimate given",
    dir: "at least",
    suffix: "%",
  },
  {
    key: "close_rate" as const,
    label: "Close rate",
    help: "Estimates \u2192 sold",
    dir: "at least",
    suffix: "%",
  },
  {
    key: "junk_pct" as const,
    label: "Junk leads",
    help: "Per channel",
    dir: "under",
    suffix: "%",
  },
  {
    key: "marketing_pct" as const,
    label: "Marketing % of revenue",
    help: "Spend \u00f7 revenue sold",
    dir: "under",
    suffix: "%",
  },
  {
    key: "cac" as const,
    label: "CAC",
    help: "Per job sold",
    dir: "under",
    prefix: "$",
  },
];

const spendSourceOptions: { value: ChannelSpendSource; label: string }[] = [
  { value: "synced", label: "Synced from ad account" },
  { value: "manual", label: "Entered by hand" },
  { value: "none", label: "No spend" },
];

export function SettingsForm() {
  // Fetch data using SWR (cached across navigations) - use "all" to get inactive too
  const { data: fetchedChannels = [], isLoading: channelsLoading } = useChannels(false);
  const { data: fetchedServices = [], isLoading: servicesLoading } = useServices(false);
  const { data: fetchedLostReasons = [], isLoading: lostReasonsLoading } = useLostReasons(false);
  const { data: fetchedSettings, isLoading: settingsLoading } = useSettings();

  const isLoading = channelsLoading || servicesLoading || lostReasonsLoading || settingsLoading;
  const [isInitialized, setIsInitialized] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Channels state
  const [channels, setChannels] = useState<ChannelFormData[]>([]);

  // Services state
  const [services, setServices] = useState<ServiceFormData[]>([]);

  // Lost reasons state
  const [lostReasons, setLostReasons] = useState<LostReasonFormData[]>([]);

  // Settings state
  const [hourlyRate, setHourlyRate] = useState(75);
  const [sharedCostMode, setSharedCostMode] = useState<SharedCostMode>("overall_cac_only");
  const [targets, setTargets] = useState<Targets>(defaultTargets);

  // Initialize form state from fetched data (only once)
  useEffect(() => {
    if (!isInitialized && !isLoading) {
      setChannels(
        fetchedChannels.map((c) => ({
          id: c.id,
          name: c.name,
          spend_source: c.spend_source,
          active: c.active,
          sort_order: c.sort_order,
        }))
      );
      setServices(
        fetchedServices.map((s) => ({
          id: s.id,
          name: s.name,
          sort_order: s.sort_order,
        }))
      );
      setLostReasons(
        fetchedLostReasons.map((r) => ({
          id: r.id,
          name: r.name,
        }))
      );
      if (fetchedSettings) {
        setHourlyRate(fetchedSettings.hourly_rate);
        setSharedCostMode(fetchedSettings.shared_cost_mode);
        setTargets(fetchedSettings.targets);
      }
      setIsInitialized(true);
    }
  }, [isLoading, isInitialized, fetchedChannels, fetchedServices, fetchedLostReasons, fetchedSettings]);

  // Show skeleton while loading (only on first load)
  if (isLoading && !isInitialized) {
    return <PageSkeleton />;
  }

  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      // Save all sections
      const [channelsResult, servicesResult, reasonsResult, settingsResult] =
        await Promise.all([
          saveChannels(channels),
          saveServices(services),
          saveLostReasons(lostReasons),
          saveSettings({
            hourly_rate: hourlyRate,
            shared_cost_mode: sharedCostMode,
            targets,
          }),
        ]);

      const error =
        channelsResult.error ||
        servicesResult.error ||
        reasonsResult.error ||
        settingsResult.error;

      if (error) {
        setMessage({ type: "error", text: error });
      } else {
        // Refresh SWR cache
        invalidateChannels();
        invalidateServices();
        invalidateLostReasons();
        invalidateSettings();
        setMessage({ type: "success", text: "Settings saved!" });
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  // Channel handlers
  const addChannel = () => {
    setChannels([
      ...channels,
      {
        name: "",
        spend_source: "none",
        active: true,
        sort_order: channels.length + 1,
      },
    ]);
  };

  const updateChannel = (
    index: number,
    updates: Partial<ChannelFormData>
  ) => {
    setChannels(
      channels.map((c, i) => (i === index ? { ...c, ...updates } : c))
    );
  };

  // Service handlers
  const addService = () => {
    setServices([
      ...services,
      { name: "", sort_order: services.length + 1 },
    ]);
  };

  const updateService = (index: number, name: string) => {
    setServices(
      services.map((s, i) => (i === index ? { ...s, name } : s))
    );
  };

  // Lost reason handlers
  const addLostReason = () => {
    setLostReasons([...lostReasons, { name: "" }]);
  };

  const updateLostReason = (index: number, name: string) => {
    setLostReasons(
      lostReasons.map((r, i) => (i === index ? { ...r, name } : r))
    );
  };

  // Target handlers
  const updateTarget = (key: keyof Targets, value: number) => {
    setTargets({ ...targets, [key]: value });
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-archivo font-extrabold text-[34px] tracking-tight">
            Settings
          </h1>
          <p className="text-muted">
            Set these once. Every dropdown and every target on the other screens
            comes from here.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="bg-accent text-white font-semibold px-6 py-2.5 rounded-lg min-h-[44px] hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving..." : "Save settings"}
        </button>
      </div>

      {message && (
        <div
          className={`mb-6 p-3 rounded-lg text-sm font-medium ${
            message.type === "success"
              ? "bg-on-target-bg text-on-target"
              : "bg-below-target-bg text-below-target"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap gap-6 items-start">
        {/* Left column - Channels and Targets */}
        <div className="flex-[999_1_640px] min-w-0 flex flex-col gap-6">
          {/* Channels */}
          <section className="bg-white border border-border rounded-xl p-6">
            <div className="mb-4">
              <h2 className="font-archivo font-bold text-xl">Channels</h2>
              <p className="text-sm text-muted">
                Used on Leads, Jobs and Spend. Turning one off hides it from
                dropdowns but keeps its history.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted">
                    <th className="px-3 py-2.5 border-b-2 border-ink">Name</th>
                    <th className="px-3 py-2.5 border-b-2 border-ink">Spend</th>
                    <th className="px-3 py-2.5 border-b-2 border-ink">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((channel, index) => (
                    <tr key={channel.id ?? `new-${index}`} className="border-b border-border">
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={channel.name}
                          onChange={(e) =>
                            updateChannel(index, { name: e.target.value })
                          }
                          aria-label="Channel name"
                          className="w-full max-w-[280px] px-3 py-2.5 border border-border-dark rounded-lg bg-white text-ink font-semibold min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={channel.spend_source}
                          onChange={(e) =>
                            updateChannel(index, {
                              spend_source: e.target.value as ChannelSpendSource,
                            })
                          }
                          aria-label={`Spend source for ${channel.name}`}
                          className="px-3 py-2.5 border border-border-dark rounded-lg bg-white text-ink text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                          {spendSourceOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={channel.active}
                            onChange={(e) =>
                              updateChannel(index, { active: e.target.checked })
                            }
                            className="w-5 h-5 accent-ink"
                          />
                          <span>On</span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addChannel}
              className="mt-4 font-semibold border border-dashed border-border-dark px-4 py-2.5 rounded-lg min-h-[44px] hover:border-ink transition-colors"
            >
              + Add channel
            </button>
          </section>

          {/* Targets */}
          <section className="bg-white border border-border rounded-xl p-6">
            <div className="mb-4">
              <h2 className="font-archivo font-bold text-xl">Targets</h2>
              <p className="text-sm text-muted">
                A number that misses its target turns orange on the Overview and
                shows up in the alerts.
              </p>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
              {targetConfig.map((t) => (
                <div
                  key={t.key}
                  className="rounded-lg bg-ground p-4 flex items-center justify-between gap-3"
                >
                  <label
                    htmlFor={`target-${t.key}`}
                    className="flex flex-col gap-0.5 font-semibold"
                  >
                    {t.label}
                    <span className="text-xs font-normal text-muted">
                      {t.help}
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5 flex-none">
                    <span className="text-sm text-muted">{t.dir}</span>
                    {t.prefix && (
                      <span className="text-sm text-muted">{t.prefix}</span>
                    )}
                    <input
                      id={`target-${t.key}`}
                      type="text"
                      inputMode="decimal"
                      value={targets[t.key]}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateTarget(t.key, val);
                      }}
                      className="w-[72px] px-3 py-2.5 text-right font-semibold border border-border-dark rounded-lg bg-white text-ink min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    {t.suffix && (
                      <span className="text-sm text-muted">{t.suffix}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right column - Services, Lost Reasons, Costs, Connections */}
        <div className="flex-[1_1_340px] min-w-0 flex flex-col gap-6">
          {/* Services */}
          <section className="bg-white border border-border rounded-xl p-6">
            <div className="mb-3">
              <h2 className="font-archivo font-bold text-xl">Services</h2>
              <p className="text-sm text-muted">
                Avg ticket and margin are split by these
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {services.map((service, index) => (
                <input
                  key={service.id ?? `new-${index}`}
                  type="text"
                  value={service.name}
                  onChange={(e) => updateService(index, e.target.value)}
                  aria-label="Service name"
                  className="w-full px-3 py-2.5 border border-border-dark rounded-lg bg-white text-ink min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addService}
              className="mt-3 font-semibold border border-dashed border-border-dark px-4 py-2.5 rounded-lg min-h-[44px] hover:border-ink transition-colors"
            >
              + Add service
            </button>
          </section>

          {/* Lost Reasons */}
          <section className="bg-white border border-border rounded-xl p-6">
            <div className="mb-3">
              <h2 className="font-archivo font-bold text-xl">Lost reasons</h2>
              <p className="text-sm text-muted">
                Picked when a lead moves to Lost
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {lostReasons.map((reason, index) => (
                <input
                  key={reason.id ?? `new-${index}`}
                  type="text"
                  value={reason.name}
                  onChange={(e) => updateLostReason(index, e.target.value)}
                  aria-label="Lost reason"
                  className="w-full px-3 py-2.5 border border-border-dark rounded-lg bg-white text-ink min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addLostReason}
              className="mt-3 font-semibold border border-dashed border-border-dark px-4 py-2.5 rounded-lg min-h-[44px] hover:border-ink transition-colors"
            >
              + Add reason
            </button>
          </section>

          {/* Costs */}
          <section className="bg-white border border-border rounded-xl p-6">
            <h2 className="font-archivo font-bold text-xl mb-4">Costs</h2>

            <label className="flex items-center justify-between gap-3 font-semibold">
              Your hourly rate
              <span className="flex items-center gap-1.5">
                <span className="text-muted font-normal">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={hourlyRate}
                  onChange={(e) =>
                    setHourlyRate(parseFloat(e.target.value) || 0)
                  }
                  className="w-[72px] px-3 py-2.5 text-right font-semibold border border-border-dark rounded-lg bg-white text-ink min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <span className="text-muted font-normal">/hr</span>
              </span>
            </label>
            <p className="text-sm text-muted mt-1 mb-4">
              Values the time you spend on estimates
            </p>

            <fieldset className="border-0 m-0 p-0">
              <legend className="font-semibold mb-2">
                Shared sales &amp; tool costs
              </legend>
              <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer">
                <input
                  type="radio"
                  name="shared_cost_mode"
                  checked={sharedCostMode === "overall_cac_only"}
                  onChange={() => setSharedCostMode("overall_cac_only")}
                  className="w-5 h-5 accent-ink"
                />
                Overall CAC only
              </label>
              <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer">
                <input
                  type="radio"
                  name="shared_cost_mode"
                  checked={sharedCostMode === "split_by_lead_count"}
                  onChange={() => setSharedCostMode("split_by_lead_count")}
                  className="w-5 h-5 accent-ink"
                />
                Split across channels by lead count
              </label>
            </fieldset>
          </section>

          {/* Connections (read-only for now) */}
          <section className="bg-white border border-border rounded-xl p-6">
            <h2 className="font-archivo font-bold text-xl mb-3">Connections</h2>

            <div className="flex flex-col">
              {[
                {
                  name: "GoHighLevel",
                  detail: "Imports new leads only",
                  connected: false,
                },
                {
                  name: "Google Ads",
                  detail: "Spend synced nightly",
                  connected: false,
                },
                {
                  name: "Meta Ads",
                  detail: "Spend synced nightly",
                  connected: false,
                },
                {
                  name: "Local Services Ads",
                  detail: "Spend synced nightly",
                  connected: false,
                },
              ].map((connection, index) => (
                <div
                  key={connection.name}
                  className={`flex items-center justify-between gap-3 py-2 ${
                    index < 3 ? "border-b border-border" : ""
                  }`}
                >
                  <div>
                    <span className="font-semibold">{connection.name}</span>
                    <p className="text-sm text-muted">{connection.detail}</p>
                  </div>
                  <span
                    className={`text-sm font-semibold px-2 py-1 rounded-md flex-none ${
                      connection.connected
                        ? "text-on-target bg-on-target-bg"
                        : "text-muted bg-ground"
                    }`}
                  >
                    {connection.connected ? "Connected" : "Not set up"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
