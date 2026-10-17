"use client";

import { useState, useTransition, useEffect } from "react";
import type { Job, Channel, Service, Lead, JobStatus } from "@/lib/types";
import { createJob, updateJob, updateJobCostProfit, deleteJob } from "./actions";
import { useJobs, useChannels, useServices, useLead } from "@/lib/swr/hooks";
import { PageSkeleton } from "@/components/PageSkeleton";

type JobWithRelations = Job & {
  channel: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
  lead: { id: string; name: string } | null;
};

interface JobsViewProps {
  prefillLeadId: string | null;
}

const JOB_STATUSES: { value: JobStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "paid", label: "Paid" },
];

function formatCurrency(amount: number | null): string {
  if (amount === null) return "";
  return "$" + amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function parseCurrency(value: string): number | null {
  const num = parseFloat(value.replace(/[$,]/g, ""));
  return isNaN(num) ? null : num;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function JobsView({ prefillLeadId }: JobsViewProps) {
  // Fetch data using SWR (cached across navigations)
  const { data: jobs = [], isLoading: jobsLoading, mutate: mutateJobs } = useJobs();
  const { data: channels = [], isLoading: channelsLoading } = useChannels();
  const { data: services = [], isLoading: servicesLoading } = useServices();
  const { data: prefillFromLead } = useLead(prefillLeadId);

  const isLoading = jobsLoading || channelsLoading || servicesLoading;

  // Show skeleton while loading (only on first load - SWR will show cached data on subsequent visits)
  if (isLoading && jobs.length === 0) {
    return <PageSkeleton />;
  }

  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(!!prefillLeadId);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterService, setFilterService] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    lead_id: prefillFromLead?.id || null,
    sold_date: getTodayISO(),
    customer: prefillFromLead?.name || "",
    town: prefillFromLead?.town || "",
    service_id: prefillFromLead?.service_id || "",
    channel_id: prefillFromLead?.channel_id || "",
    referrer_name: prefillFromLead?.referrer_name || "",
    status: "scheduled" as JobStatus,
    sold_amount: "",
    job_cost: "",
    gross_profit: "",
    notes: "",
  });

  // Open form when prefillFromLead changes
  useEffect(() => {
    if (prefillFromLead) {
      setShowAddForm(true);
      setFormData({
        lead_id: prefillFromLead.id,
        sold_date: getTodayISO(),
        customer: prefillFromLead.name || "",
        town: prefillFromLead.town || "",
        service_id: prefillFromLead.service_id || "",
        channel_id: prefillFromLead.channel_id || "",
        referrer_name: prefillFromLead.referrer_name || "",
        status: "scheduled",
        sold_amount: "",
        job_cost: "",
        gross_profit: "",
        notes: "",
      });
    }
  }, [prefillFromLead]);

  // Calculate stats
  const totalJobs = jobs.length;
  const totalRevenue = jobs.reduce((sum, j) => sum + (j.sold_amount || 0), 0);
  const avgTicket = totalJobs > 0 ? totalRevenue / totalJobs : 0;

  const costedJobs = jobs.filter((j) => j.job_cost !== null);
  const totalProfit = costedJobs.reduce(
    (sum, j) => sum + (j.gross_profit || 0),
    0
  );
  const costedRevenue = costedJobs.reduce(
    (sum, j) => sum + (j.sold_amount || 0),
    0
  );
  const avgMargin =
    costedRevenue > 0 ? (totalProfit / costedRevenue) * 100 : 0;

  const missingCostJobs = jobs.filter((j) => j.job_cost === null);
  const scheduledMissing = missingCostJobs.filter(
    (j) => j.status === "scheduled"
  ).length;
  const inProgressMissing = missingCostJobs.filter(
    (j) => j.status === "in_progress"
  ).length;

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    if (filterChannel && job.channel_id !== filterChannel) return false;
    if (filterService && job.service_id !== filterService) return false;
    if (filterStatus) {
      if (filterStatus === "missing_cost") {
        if (job.job_cost !== null) return false;
      } else if (job.status !== filterStatus) {
        return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesCustomer = job.customer?.toLowerCase().includes(q);
      const matchesTown = job.town?.toLowerCase().includes(q);
      if (!matchesCustomer && !matchesTown) return false;
    }
    return true;
  });

  const handleAddJob = (addAnother: boolean = false) => {
    startTransition(async () => {
      const result = await createJob({
        lead_id: formData.lead_id,
        sold_date: formData.sold_date,
        customer: formData.customer,
        town: formData.town,
        service_id: formData.service_id || null,
        channel_id: formData.channel_id || null,
        referrer_name: formData.referrer_name,
        status: formData.status,
        sold_amount: parseCurrency(formData.sold_amount),
        job_cost: parseCurrency(formData.job_cost),
        gross_profit: parseCurrency(formData.gross_profit),
        notes: formData.notes,
      });

      if (result.success) {
        mutateJobs(); // Refresh SWR cache
        if (addAnother) {
          setFormData({
            lead_id: null,
            sold_date: getTodayISO(),
            customer: "",
            town: "",
            service_id: "",
            channel_id: "",
            referrer_name: "",
            status: "scheduled",
            sold_amount: "",
            job_cost: "",
            gross_profit: "",
            notes: "",
          });
        } else {
          setShowAddForm(false);
        }
      }
    });
  };

  // Auto-fill cost/profit
  const handleAmountChange = (field: "sold_amount" | "job_cost" | "gross_profit", value: string) => {
    const newData = { ...formData, [field]: value };

    const soldAmount = parseCurrency(field === "sold_amount" ? value : formData.sold_amount);
    const jobCost = parseCurrency(field === "job_cost" ? value : formData.job_cost);
    const grossProfit = parseCurrency(field === "gross_profit" ? value : formData.gross_profit);

    if (field === "job_cost" && soldAmount !== null && jobCost !== null) {
      newData.gross_profit = formatCurrency(soldAmount - jobCost);
    } else if (field === "gross_profit" && soldAmount !== null && grossProfit !== null) {
      newData.job_cost = formatCurrency(soldAmount - grossProfit);
    }

    setFormData(newData);
  };

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-archivo font-extrabold text-[34px] tracking-tight">
            Jobs
          </h1>
          <p className="text-muted">
            Add each sold job by hand. Fill in cost or profit once the job is
            finished.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="bg-accent text-white font-semibold px-5 py-2.5 rounded-lg min-h-[44px] hover:bg-accent/90 transition-colors"
        >
          + Add job
        </button>
      </div>

      {/* Add Job Form */}
      {showAddForm && (
        <section className="bg-white border-2 border-ink rounded-xl p-6 flex flex-col gap-4">
          <div className="flex flex-wrap justify-between items-baseline gap-2">
            <h2 className="font-archivo font-bold text-xl">Add a sold job</h2>
            <span className="text-sm text-muted">
              Cost and profit can wait until the job is done
            </span>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Sold date
              <input
                type="date"
                value={formData.sold_date}
                onChange={(e) =>
                  setFormData({ ...formData, sold_date: e.target.value })
                }
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Customer
              <input
                type="text"
                value={formData.customer}
                onChange={(e) =>
                  setFormData({ ...formData, customer: e.target.value })
                }
                placeholder="Name"
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Town
              <input
                type="text"
                value={formData.town}
                onChange={(e) =>
                  setFormData({ ...formData, town: e.target.value })
                }
                placeholder="e.g. Montclair"
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Service
              <select
                value={formData.service_id}
                onChange={(e) =>
                  setFormData({ ...formData, service_id: e.target.value })
                }
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              >
                <option value="">Choose...</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Channel
              <select
                value={formData.channel_id}
                onChange={(e) =>
                  setFormData({ ...formData, channel_id: e.target.value })
                }
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              >
                <option value="">Choose...</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              <span>
                Referred by{" "}
                <span className="font-normal text-muted">(referral only)</span>
              </span>
              <input
                type="text"
                value={formData.referrer_name}
                onChange={(e) =>
                  setFormData({ ...formData, referrer_name: e.target.value })
                }
                placeholder="Past customer's name"
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Status
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: e.target.value as JobStatus,
                  })
                }
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              >
                {JOB_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Sold amount
              <input
                type="text"
                inputMode="decimal"
                value={formData.sold_amount}
                onChange={(e) => handleAmountChange("sold_amount", e.target.value)}
                placeholder="$0"
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white text-right"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              <span>
                Job cost{" "}
                <span className="font-normal text-muted">(optional)</span>
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={formData.job_cost}
                onChange={(e) => handleAmountChange("job_cost", e.target.value)}
                placeholder="$0"
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white text-right"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              <span>
                Gross profit{" "}
                <span className="font-normal text-muted">(optional)</span>
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={formData.gross_profit}
                onChange={(e) => handleAmountChange("gross_profit", e.target.value)}
                placeholder="$0"
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white text-right"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
            Notes
            <textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={2}
              placeholder="Anything worth remembering about this job"
              className="font-normal text-[15px] text-ink px-3 py-2.5 border border-border-dark rounded-lg bg-white resize-y"
            />
          </label>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => handleAddJob(false)}
              disabled={isPending}
              className="bg-accent text-white font-semibold px-6 py-2.5 rounded-lg min-h-[44px] hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving..." : "Save job"}
            </button>
            <button
              type="button"
              onClick={() => handleAddJob(true)}
              disabled={isPending}
              className="border border-border-dark bg-white font-semibold px-6 py-2.5 rounded-lg min-h-[44px] hover:bg-ground transition-colors"
            >
              Save & add another
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-[#3D4248] px-4 py-2.5 rounded-lg min-h-[44px] hover:bg-ground transition-colors"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Stats Cards */}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted uppercase tracking-wider">
            Jobs sold
          </span>
          <span className="font-archivo font-bold text-[32px] leading-tight">
            {totalJobs}
          </span>
          <span className="text-xs text-[#6B7077]">
            Avg ticket {formatCurrency(avgTicket)}
          </span>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted uppercase tracking-wider">
            Revenue sold
          </span>
          <span className="font-archivo font-bold text-[32px] leading-tight">
            {formatCurrency(totalRevenue)}
          </span>
          <span className="text-xs text-[#6B7077]">All {totalJobs} jobs</span>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted uppercase tracking-wider">
            Gross profit
          </span>
          <span className="font-archivo font-bold text-[32px] leading-tight">
            {formatCurrency(totalProfit)}
          </span>
          <span className="text-xs text-[#6B7077]">
            From the {costedJobs.length} jobs with costs entered
          </span>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted uppercase tracking-wider">
            Avg margin
          </span>
          <span className="font-archivo font-bold text-[32px] leading-tight">
            {avgMargin.toFixed(1)}%
          </span>
          <span className="text-xs text-[#6B7077]">
            Gross profit / revenue, costed jobs
          </span>
        </div>
        {missingCostJobs.length > 0 && (
          <div className="bg-below-target-bg border border-[#F3C9A8] rounded-xl p-4 flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-[#7C2D12] uppercase tracking-wider">
              Missing cost
            </span>
            <span className="font-archivo font-bold text-[32px] leading-tight text-[#7C2D12]">
              {missingCostJobs.length}
            </span>
            <span className="text-xs text-[#7C2D12]">
              {scheduledMissing} scheduled, {inProgressMissing} in progress
            </span>
          </div>
        )}
      </section>

      {/* Jobs Table */}
      <section className="bg-white border border-border rounded-xl p-6 flex flex-col gap-4">
        <div className="flex flex-wrap justify-between items-end gap-3">
          <h2 className="font-archivo font-bold text-xl">Sold jobs</h2>
          <div className="flex flex-wrap gap-2.5 items-end">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Search
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Customer or town"
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] w-[200px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Channel
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              >
                <option value="">All channels</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Service
              <select
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Status
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              >
                <option value="">All statuses</option>
                {JOB_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
                <option value="missing_cost">Missing cost</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse tabular-nums">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-3 py-2.5 border-b-2 border-ink">Sold</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Customer</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Service</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Channel</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Status</th>
                <th className="px-3 py-2.5 border-b-2 border-ink text-right">
                  Sold amount
                </th>
                <th className="px-3 py-2.5 border-b-2 border-ink text-right">
                  Job cost
                </th>
                <th className="px-3 py-2.5 border-b-2 border-ink text-right">
                  Gross profit
                </th>
                <th className="px-3 py-2.5 border-b-2 border-ink text-right">
                  Margin
                </th>
                <th className="px-3 py-2.5 border-b-2 border-ink">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  channels={channels}
                  services={services}
                  onMutate={mutateJobs}
                />
              ))}
            </tbody>
          </table>
        </div>

        {filteredJobs.length === 0 && (
          <p className="text-center text-muted py-8">
            No jobs found. Add your first job to get started.
          </p>
        )}
      </section>

      <p className="text-sm text-muted max-w-3xl">
        Job cost and gross profit are both entered by hand. Type whichever one
        you know and the other fills in (sold amount - cost = profit); margin is
        always calculated. Job cost = materials, labor/crew, dumpster and
        permits.
      </p>
    </>
  );
}

function JobRow({
  job,
  channels,
  services,
  onMutate,
}: {
  job: JobWithRelations;
  channels: Channel[];
  services: Service[];
  onMutate: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [costValue, setCostValue] = useState(
    job.job_cost !== null ? formatCurrency(job.job_cost) : ""
  );
  const [profitValue, setProfitValue] = useState(
    job.gross_profit !== null ? formatCurrency(job.gross_profit) : ""
  );

  // Edit form state
  const [editData, setEditData] = useState({
    sold_date: job.sold_date,
    customer: job.customer || "",
    town: job.town || "",
    service_id: job.service_id || "",
    channel_id: job.channel_id || "",
    referrer_name: job.referrer_name || "",
    status: job.status,
    sold_amount: job.sold_amount !== null ? formatCurrency(job.sold_amount) : "",
    job_cost: job.job_cost !== null ? formatCurrency(job.job_cost) : "",
    gross_profit: job.gross_profit !== null ? formatCurrency(job.gross_profit) : "",
    notes: job.notes || "",
  });

  const margin =
    job.sold_amount && job.gross_profit
      ? ((job.gross_profit / job.sold_amount) * 100).toFixed(0) + "%"
      : "-";

  const handleCostBlur = () => {
    const newCost = parseCurrency(costValue);
    if (newCost !== job.job_cost) {
      startTransition(async () => {
        await updateJobCostProfit(job.id, "job_cost", newCost, job.sold_amount);
        onMutate(); // Refresh SWR cache
      });
    }
  };

  const handleProfitBlur = () => {
    const newProfit = parseCurrency(profitValue);
    if (newProfit !== job.gross_profit) {
      startTransition(async () => {
        await updateJobCostProfit(
          job.id,
          "gross_profit",
          newProfit,
          job.sold_amount
        );
        onMutate(); // Refresh SWR cache
      });
    }
  };

  const handleEditAmountChange = (
    field: "sold_amount" | "job_cost" | "gross_profit",
    value: string
  ) => {
    const newData = { ...editData, [field]: value };

    const soldAmount = parseCurrency(field === "sold_amount" ? value : editData.sold_amount);
    const jobCost = parseCurrency(field === "job_cost" ? value : editData.job_cost);
    const grossProfit = parseCurrency(field === "gross_profit" ? value : editData.gross_profit);

    if (field === "job_cost" && soldAmount !== null && jobCost !== null) {
      newData.gross_profit = formatCurrency(soldAmount - jobCost);
    } else if (field === "gross_profit" && soldAmount !== null && grossProfit !== null) {
      newData.job_cost = formatCurrency(soldAmount - grossProfit);
    }

    setEditData(newData);
  };

  const handleSaveEdit = () => {
    startTransition(async () => {
      await updateJob(job.id, {
        sold_date: editData.sold_date,
        customer: editData.customer,
        town: editData.town,
        service_id: editData.service_id || null,
        channel_id: editData.channel_id || null,
        referrer_name: editData.referrer_name,
        status: editData.status,
        sold_amount: parseCurrency(editData.sold_amount),
        job_cost: parseCurrency(editData.job_cost),
        gross_profit: parseCurrency(editData.gross_profit),
        notes: editData.notes,
      });
      onMutate(); // Refresh SWR cache
      setIsEditing(false);
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteJob(job.id);
      onMutate(); // Refresh SWR cache
      setShowDeleteConfirm(false);
    });
  };

  const statusLabel =
    JOB_STATUSES.find((s) => s.value === job.status)?.label || job.status;

  const needsCost = job.job_cost === null;

  // Edit mode - show inline edit form
  if (isEditing) {
    return (
      <tr className="border-b border-border bg-ground/50">
        <td colSpan={10} className="px-3 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Editing job</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm font-semibold text-below-target hover:underline min-h-[44px] px-3"
                >
                  Delete job
                </button>
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
                Sold date
                <input
                  type="date"
                  value={editData.sold_date}
                  onChange={(e) =>
                    setEditData({ ...editData, sold_date: e.target.value })
                  }
                  className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
                Customer
                <input
                  type="text"
                  value={editData.customer}
                  onChange={(e) =>
                    setEditData({ ...editData, customer: e.target.value })
                  }
                  className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
                Town
                <input
                  type="text"
                  value={editData.town}
                  onChange={(e) =>
                    setEditData({ ...editData, town: e.target.value })
                  }
                  className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
                Service
                <select
                  value={editData.service_id}
                  onChange={(e) =>
                    setEditData({ ...editData, service_id: e.target.value })
                  }
                  className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
                >
                  <option value="">Choose...</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
                Channel
                <select
                  value={editData.channel_id}
                  onChange={(e) =>
                    setEditData({ ...editData, channel_id: e.target.value })
                  }
                  className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
                >
                  <option value="">Choose...</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
                Referred by
                <input
                  type="text"
                  value={editData.referrer_name}
                  onChange={(e) =>
                    setEditData({ ...editData, referrer_name: e.target.value })
                  }
                  className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
                Status
                <select
                  value={editData.status}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      status: e.target.value as JobStatus,
                    })
                  }
                  className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
                >
                  {JOB_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
                Sold amount
                <input
                  type="text"
                  inputMode="decimal"
                  value={editData.sold_amount}
                  onChange={(e) =>
                    handleEditAmountChange("sold_amount", e.target.value)
                  }
                  className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white text-right"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
                Job cost
                <input
                  type="text"
                  inputMode="decimal"
                  value={editData.job_cost}
                  onChange={(e) =>
                    handleEditAmountChange("job_cost", e.target.value)
                  }
                  className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white text-right"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
                Gross profit
                <input
                  type="text"
                  inputMode="decimal"
                  value={editData.gross_profit}
                  onChange={(e) =>
                    handleEditAmountChange("gross_profit", e.target.value)
                  }
                  className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white text-right"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Notes
              <textarea
                value={editData.notes}
                onChange={(e) =>
                  setEditData({ ...editData, notes: e.target.value })
                }
                rows={2}
                className="font-normal text-[15px] text-ink px-3 py-2.5 border border-border-dark rounded-lg bg-white resize-y"
              />
            </label>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isPending}
                className="bg-accent text-white font-semibold px-5 py-2.5 rounded-lg min-h-[44px] hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="border border-border-dark bg-white font-semibold px-5 py-2.5 rounded-lg min-h-[44px] hover:bg-ground transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Delete confirmation */}
            {showDeleteConfirm && (
              <div className="bg-below-target-bg border border-[#F3C9A8] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[#7C2D12] font-semibold">
                  Are you sure you want to delete this job? This cannot be undone.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="bg-below-target text-white font-semibold px-4 py-2 rounded-lg min-h-[44px] hover:bg-below-target/90 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? "Deleting..." : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="border border-[#F3C9A8] bg-white font-semibold px-4 py-2 rounded-lg min-h-[44px] hover:bg-ground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  }

  // Normal view
  return (
    <tr className="border-b border-border hover:bg-ground/30">
      <td className="px-3 py-2.5 whitespace-nowrap">
        {formatDate(job.sold_date)}
      </td>
      <td className="px-3 py-2.5 font-semibold">
        <span className="block">{job.customer || "-"}</span>
        <span className="block text-sm font-normal text-muted">
          {job.town || "-"}
        </span>
      </td>
      <td className="px-3 py-2.5">{job.service?.name || "-"}</td>
      <td className="px-3 py-2.5">
        <span className="block">{job.channel?.name || "-"}</span>
        {job.referrer_name && (
          <span className="block text-sm text-muted">
            by {job.referrer_name}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm font-semibold text-[#3D4248] bg-ground border border-[#DCD8D0] px-2 py-1 rounded-md whitespace-nowrap">
          {statusLabel}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-semibold">
        {formatCurrency(job.sold_amount)}
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          inputMode="decimal"
          value={costValue}
          onChange={(e) => setCostValue(e.target.value)}
          onBlur={handleCostBlur}
          placeholder={needsCost ? "Add cost" : "$0"}
          aria-label={`Job cost for ${job.customer}`}
          className={`w-[110px] text-right px-2.5 py-2.5 min-h-[44px] rounded-lg ${
            needsCost
              ? "border-2 border-accent bg-[#FFF7F1]"
              : "border border-border-dark bg-white"
          }`}
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          inputMode="decimal"
          value={profitValue}
          onChange={(e) => setProfitValue(e.target.value)}
          onBlur={handleProfitBlur}
          placeholder={needsCost ? "Add profit" : "$0"}
          aria-label={`Gross profit for ${job.customer}`}
          className={`w-[110px] text-right px-2.5 py-2.5 min-h-[44px] rounded-lg ${
            needsCost
              ? "border-2 border-accent bg-[#FFF7F1]"
              : "border border-border-dark bg-white"
          }`}
        />
      </td>
      <td className="px-3 py-2.5 text-right">{margin}</td>
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="text-sm font-semibold text-ink hover:text-accent inline-flex items-center min-h-[44px]"
        >
          Edit
        </button>
      </td>
    </tr>
  );
}
