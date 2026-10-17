"use client";

import { useState, useTransition, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import type { Lead, Channel, Service, LostReason, LeadStage } from "@/lib/types";
import {
  createLead,
  changeLeadStage,
  resolveDuplicate,
  updateLead,
  deleteLead,
} from "./actions";
import {
  useLeads,
  useChannels,
  useServices,
  useLostReasons,
  invalidateLeads,
} from "@/lib/swr/hooks";
import { PageSkeleton } from "@/components/PageSkeleton";

type LeadWithRelations = Lead & {
  channel: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
  lost_reason: { id: string; name: string } | null;
  jobs: { id: string }[];
};

const STAGES: { value: LeadStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted / Call again" },
  { value: "call_again", label: "Call again" },
  { value: "booked", label: "Booked" },
  { value: "no_show", label: "No show" },
  { value: "estimate_given", label: "Estimate given" },
  { value: "follow_up", label: "Follow-up" },
  { value: "sold", label: "Sold" },
  { value: "lost", label: "Lost" },
  { value: "junk", label: "Junk" },
];

const STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted / Call again",
  call_again: "Call again",
  booked: "Booked",
  no_show: "No show",
  estimate_given: "Estimate given",
  follow_up: "Follow-up",
  sold: "Sold",
  lost: "Lost",
  junk: "Junk",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Action types for optimistic updates
type OptimisticAction =
  | { type: "update_stage"; leadId: string; stage: LeadStage; lostReasonId?: string }
  | { type: "update_lead"; leadId: string; data: Partial<LeadWithRelations> }
  | { type: "delete_lead"; leadId: string }
  | { type: "add_lead"; lead: LeadWithRelations };

export function LeadsView() {
  // Fetch data using SWR (cached across navigations)
  const { data: leads = [], isLoading: leadsLoading, mutate: mutateLeads } = useLeads();
  const { data: channels = [], isLoading: channelsLoading } = useChannels();
  const { data: services = [], isLoading: servicesLoading } = useServices();
  const { data: lostReasons = [], isLoading: lostReasonsLoading } = useLostReasons();

  const isLoading = leadsLoading || channelsLoading || servicesLoading || lostReasonsLoading;

  // Show skeleton while loading (only on first load - SWR will show cached data on subsequent visits)
  if (isLoading && leads.length === 0) {
    return <PageSkeleton />;
  }

  // Find duplicates (leads with duplicate_of set)
  const duplicates = leads.filter((l) => l.duplicate_of);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeStage, setActiveStage] = useState<LeadStage | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterChannel, setFilterChannel] = useState<string>("");
  const [filterService, setFilterService] = useState<string>("");
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);

  // Optimistic state for instant UI updates
  const [optimisticLeads, updateOptimisticLeads] = useOptimistic(
    leads,
    (state: LeadWithRelations[], action: OptimisticAction) => {
      switch (action.type) {
        case "update_stage":
          return state.map((lead) =>
            lead.id === action.leadId
              ? { ...lead, stage: action.stage, lost_reason_id: action.lostReasonId || null }
              : lead
          );
        case "update_lead":
          return state.map((lead) =>
            lead.id === action.leadId ? { ...lead, ...action.data } : lead
          );
        case "delete_lead":
          return state.filter((lead) => lead.id !== action.leadId);
        case "add_lead":
          return [action.lead, ...state];
        default:
          return state;
      }
    }
  );

  // Add form state - default date to today
  const today = new Date().toISOString().split("T")[0];
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    town: "",
    service_id: "",
    channel_id: "",
    notes: "",
    created_at: today,
  });

  // Stage counts (use optimistic leads for instant feedback)
  const stageCounts = optimisticLeads.reduce(
    (acc, lead) => {
      acc[lead.stage] = (acc[lead.stage] || 0) + 1;
      return acc;
    },
    {} as Record<LeadStage, number>
  );

  // Filter leads (use optimistic leads)
  const filteredLeads = optimisticLeads.filter((lead) => {
    if (activeStage !== "all" && lead.stage !== activeStage) return false;
    if (filterChannel && lead.channel_id !== filterChannel) return false;
    if (filterService && lead.service_id !== filterService) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = lead.name?.toLowerCase().includes(q);
      const matchesPhone = lead.phone?.includes(q);
      const matchesTown = lead.town?.toLowerCase().includes(q);
      if (!matchesName && !matchesPhone && !matchesTown) return false;
    }
    return true;
  });

  const handleAddLead = () => {
    // Create optimistic lead for instant UI update
    const now = new Date().toISOString();
    const optimisticLead: LeadWithRelations = {
      id: `temp-${Date.now()}`,
      user_id: "",
      created_at: formData.created_at ? new Date(formData.created_at).toISOString() : now,
      updated_at: now,
      origin: "manual",
      ghl_contact_id: null,
      name: formData.name || null,
      phone: formData.phone || null,
      phone_normalized: formData.phone?.replace(/\D/g, "") || null,
      town: formData.town || null,
      service_id: formData.service_id || null,
      channel_id: formData.channel_id,
      referrer_name: null,
      stage: "new",
      next_step: null,
      lost_reason_id: null,
      notes: formData.notes || null,
      edited_fields: [],
      duplicate_of: null,
      channel: channels.find((c) => c.id === formData.channel_id) || null,
      service: services.find((s) => s.id === formData.service_id) || null,
      lost_reason: null,
      jobs: [],
    };

    // Update UI immediately
    updateOptimisticLeads({ type: "add_lead", lead: optimisticLead });
    setShowAddForm(false);
    setFormData({
      name: "",
      phone: "",
      town: "",
      service_id: "",
      channel_id: "",
      notes: "",
      created_at: today,
    });

    // Then sync with server and refresh cache
    startTransition(async () => {
      await createLead({
        ...formData,
        service_id: formData.service_id || null,
        created_at: formData.created_at ? new Date(formData.created_at).toISOString() : undefined,
      });
      mutateLeads(); // Refresh SWR cache
    });
  };

  const handleStageChange = (
    leadId: string,
    newStage: LeadStage,
    lostReasonId?: string
  ) => {
    // Update UI immediately
    updateOptimisticLeads({ type: "update_stage", leadId, stage: newStage, lostReasonId });

    // Then sync with server and refresh cache
    startTransition(async () => {
      const result = await changeLeadStage(leadId, newStage, lostReasonId);
      mutateLeads(); // Refresh SWR cache
      if (result.success && result.showJobForm) {
        router.push(`/jobs?from_lead=${leadId}`);
      }
    });
  };

  const handleResolveDuplicate = (
    leadId: string,
    action: "merge" | "keep_both"
  ) => {
    startTransition(async () => {
      await resolveDuplicate(leadId, action);
      mutateLeads(); // Refresh SWR cache
    });
  };

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-archivo font-extrabold text-[34px] tracking-tight">
            Leads
          </h1>
          <p className="text-muted">
            New GHL leads come in automatically; phone and word-of-mouth leads
            you add here. Every stage change happens on this screen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 items-center">
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="bg-accent text-white font-semibold px-5 py-2.5 rounded-lg min-h-[44px] hover:bg-accent/90 transition-colors"
          >
            + Add lead
          </button>
        </div>
      </div>

      {/* Add Lead Form */}
      {showAddForm && (
        <section className="bg-white border-2 border-ink rounded-xl p-6 flex flex-col gap-4">
          <div className="flex flex-wrap justify-between items-baseline gap-2">
            <h2 className="font-archivo font-bold text-xl">Add a lead</h2>
            <span className="text-sm text-muted">
              Channel is required, so every lead counts toward the right numbers
            </span>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Name
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Homeowner"
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Phone
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="(973) 555-0100"
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
                placeholder="e.g. Wayne"
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
              Channel *
              <select
                value={formData.channel_id}
                onChange={(e) =>
                  setFormData({ ...formData, channel_id: e.target.value })
                }
                required
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
              Date received
              <input
                type="date"
                value={formData.created_at}
                onChange={(e) =>
                  setFormData({ ...formData, created_at: e.target.value })
                }
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Notes
              <input
                type="text"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="How they found you, roof age..."
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleAddLead}
              disabled={isPending || !formData.channel_id}
              className="bg-accent text-white font-semibold px-6 py-2.5 rounded-lg min-h-[44px] hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Saving..." : "Save lead"}
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

      {/* Duplicate Banner */}
      {duplicates.map((dup) => (
        <section
          key={dup.id}
          className="bg-below-target-bg border border-[#F3C9A8] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-col gap-0.5 text-[#7C2D12]">
            <span className="font-bold">Possible duplicate</span>
            <span>
              {dup.name}, {dup.phone}, created {formatDate(dup.created_at)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleResolveDuplicate(dup.id, "merge")}
              className="bg-[#7C2D12] text-white font-semibold px-4 py-2.5 rounded-lg min-h-[44px]"
            >
              Merge
            </button>
            <button
              type="button"
              onClick={() => handleResolveDuplicate(dup.id, "keep_both")}
              className="border border-[#C9A188] text-[#7C2D12] font-semibold px-4 py-2.5 rounded-lg min-h-[44px]"
            >
              Keep both
            </button>
          </div>
        </section>
      ))}

      {/* Leads List */}
      <section className="bg-white border border-border rounded-xl p-6 flex flex-col gap-4">
        <div className="flex flex-wrap justify-between items-end gap-3">
          <h2 className="font-archivo font-bold text-xl">
            {new Date().toLocaleDateString("en-US", { month: "long" })} leads
          </h2>
          <div className="flex flex-wrap gap-2.5 items-end">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Search
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, phone or town"
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
          </div>
        </div>

        {/* Stage Tabs */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by stage">
          <button
            type="button"
            onClick={() => setActiveStage("all")}
            aria-pressed={activeStage === "all"}
            className={`text-sm font-medium px-3.5 py-2 rounded-full min-h-[44px] border transition-colors ${
              activeStage === "all"
                ? "bg-ink text-white border-ink font-semibold"
                : "bg-white text-ink border-[#DCD8D0] hover:border-ink"
            }`}
          >
            All · {optimisticLeads.length}
          </button>
          {STAGES.filter(s => s.value !== "call_again").map((stage) => (
            <button
              key={stage.value}
              type="button"
              onClick={() => setActiveStage(stage.value)}
              aria-pressed={activeStage === stage.value}
              className={`text-sm font-medium px-3.5 py-2 rounded-full min-h-[44px] border transition-colors ${
                activeStage === stage.value
                  ? "bg-ink text-white border-ink font-semibold"
                  : "bg-white text-ink border-[#DCD8D0] hover:border-ink"
              }`}
            >
              {stage.label} · {stageCounts[stage.value] || 0}
            </button>
          ))}
        </div>

        {/* Leads Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-3 py-2.5 border-b-2 border-ink">Created</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Lead</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Town</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Service</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Channel</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">Stage</th>
                <th className="px-3 py-2.5 border-b-2 border-ink">
                  Next step / reason
                </th>
                <th className="px-3 py-2.5 border-b-2 border-ink">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  lostReasons={lostReasons}
                  onStageChange={handleStageChange}
                  isEditing={editingLeadId === lead.id}
                  onEdit={() => setEditingLeadId(lead.id)}
                  onCancelEdit={() => setEditingLeadId(null)}
                  channels={channels}
                  services={services}
                  onOptimisticUpdate={updateOptimisticLeads}
                  onMutate={mutateLeads}
                />
              ))}
            </tbody>
          </table>
        </div>

        {filteredLeads.length === 0 && (
          <p className="text-center text-muted py-8">
            No leads found. Add your first lead to get started.
          </p>
        )}
      </section>

      {/* Info Cards */}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="font-bold">Your edits win</span>
          <span className="text-muted text-sm">
            GHL only creates new leads. A field you change is never overwritten,
            and shows &quot;edited&quot;.
          </span>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="font-bold">Sold opens the job form</span>
          <span className="text-muted text-sm">
            Customer, town, service and channel carry over to Jobs. You only add
            the amount.
          </span>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="font-bold">Lost needs a reason</span>
          <span className="text-muted text-sm">
            So you can see whether you lose on price, trust or timing.
          </span>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5">
          <span className="font-bold">Junk stays out</span>
          <span className="text-muted text-sm">
            Junk leads count toward a channel&apos;s junk %, never against your
            close rate.
          </span>
        </div>
      </section>
    </>
  );
}

// Lead Row Component
function LeadRow({
  lead,
  lostReasons,
  onStageChange,
  isEditing,
  onEdit,
  onCancelEdit,
  channels,
  services,
  onOptimisticUpdate,
  onMutate,
}: {
  lead: LeadWithRelations;
  lostReasons: LostReason[];
  onStageChange: (
    leadId: string,
    newStage: LeadStage,
    lostReasonId?: string
  ) => void;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  channels: Channel[];
  services: Service[];
  onOptimisticUpdate: (action: OptimisticAction) => void;
  onMutate: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedStage, setSelectedStage] = useState<LeadStage>(lead.stage);
  const [selectedLostReason, setSelectedLostReason] = useState<string>(
    lead.lost_reason_id || ""
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editForm, setEditForm] = useState({
    name: lead.name || "",
    phone: lead.phone || "",
    town: lead.town || "",
    service_id: lead.service_id || "",
    channel_id: lead.channel_id || "",
    referrer_name: lead.referrer_name || "",
    next_step: lead.next_step || "",
    notes: lead.notes || "",
    created_at: lead.created_at ? new Date(lead.created_at).toISOString().split("T")[0] : "",
  });

  const handleStageSelect = (newStage: LeadStage) => {
    setSelectedStage(newStage);
    if (newStage === "lost") {
      // Don't submit yet, wait for lost reason
      return;
    }
    onStageChange(lead.id, newStage);
  };

  const handleLostReasonSelect = (reasonId: string) => {
    setSelectedLostReason(reasonId);
    onStageChange(lead.id, "lost", reasonId);
  };

  const handleSaveEdit = () => {
    // Update UI immediately
    onOptimisticUpdate({
      type: "update_lead",
      leadId: lead.id,
      data: {
        name: editForm.name || null,
        phone: editForm.phone || null,
        town: editForm.town || null,
        service_id: editForm.service_id || null,
        channel_id: editForm.channel_id || lead.channel_id,
        service: services.find((s) => s.id === editForm.service_id) || null,
        channel: channels.find((c) => c.id === editForm.channel_id) || lead.channel,
        referrer_name: editForm.referrer_name || null,
        next_step: editForm.next_step || null,
        notes: editForm.notes || null,
        created_at: editForm.created_at ? new Date(editForm.created_at).toISOString() : lead.created_at,
      },
    });
    onCancelEdit();

    // Then sync with server and refresh cache
    startTransition(async () => {
      await updateLead(lead.id, {
        ...editForm,
        created_at: editForm.created_at || undefined,
      });
      onMutate(); // Refresh SWR cache
    });
  };

  const handleDelete = () => {
    // Update UI immediately
    onOptimisticUpdate({ type: "delete_lead", leadId: lead.id });
    setShowDeleteConfirm(false);
    onCancelEdit();

    // Then sync with server and refresh cache
    startTransition(async () => {
      await deleteLead(lead.id);
      onMutate(); // Refresh SWR cache
    });
  };

  const hasSoldJob = lead.jobs && lead.jobs.length > 0;

  if (isEditing) {
    return (
      <tr className="border-b border-border bg-ground">
        <td colSpan={8} className="p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold">Editing lead</span>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-sm font-semibold text-below-target hover:underline min-h-[44px] px-3"
            >
              Delete lead
            </button>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 mb-3">
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Name
              <input
                type="text"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Phone
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm({ ...editForm, phone: e.target.value })
                }
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Town
              <input
                type="text"
                value={editForm.town}
                onChange={(e) =>
                  setEditForm({ ...editForm, town: e.target.value })
                }
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Service
              <select
                value={editForm.service_id}
                onChange={(e) =>
                  setEditForm({ ...editForm, service_id: e.target.value })
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
                value={editForm.channel_id}
                onChange={(e) =>
                  setEditForm({ ...editForm, channel_id: e.target.value })
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
              Next step
              <input
                type="text"
                value={editForm.next_step}
                onChange={(e) =>
                  setEditForm({ ...editForm, next_step: e.target.value })
                }
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[#3D4248]">
              Date received
              <input
                type="date"
                value={editForm.created_at}
                onChange={(e) =>
                  setEditForm({ ...editForm, created_at: e.target.value })
                }
                className="font-normal text-[15px] text-ink px-3 py-2.5 min-h-[44px] border border-border-dark rounded-lg bg-white"
              />
            </label>
          </div>

          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={isPending}
              className="bg-accent text-white font-semibold px-4 py-2 rounded-lg min-h-[44px]"
            >
              {isPending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-[#3D4248] px-4 py-2 rounded-lg min-h-[44px]"
            >
              Cancel
            </button>
          </div>

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="bg-below-target-bg border border-[#F3C9A8] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[#7C2D12] font-semibold">
                Are you sure you want to delete this lead? This cannot be undone.
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
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border align-top">
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="block">{formatDate(lead.created_at)}</span>
        <span className="inline-block mt-1 text-xs font-semibold text-[#3D4248] bg-ground border border-[#DCD8D0] px-1.5 py-0.5 rounded">
          {lead.origin === "ghl" ? "GHL" : "Manual"}
        </span>
      </td>
      <td className="px-3 py-3 text-left font-semibold">
        <span className="block">{lead.name || "—"}</span>
        <span className="block text-sm font-normal text-muted tabular-nums">
          {lead.phone || "—"}
        </span>
      </td>
      <td className="px-3 py-3">
        <span>{lead.town || "—"}</span>
        {lead.edited_fields?.includes("town") && (
          <span className="block text-xs font-semibold text-on-target">
            edited
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <span>{lead.service?.name || "—"}</span>
        {lead.edited_fields?.includes("service_id") && (
          <span className="block text-xs font-semibold text-on-target">
            edited
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className="block">{lead.channel?.name || "—"}</span>
        {lead.referrer_name && (
          <span className="block text-sm text-muted">
            by {lead.referrer_name}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <select
          value={selectedStage}
          onChange={(e) => handleStageSelect(e.target.value as LeadStage)}
          aria-label={`Stage for ${lead.name}`}
          className="text-sm font-semibold text-ink px-2.5 py-2.5 min-h-[44px] w-[170px] border border-border-dark rounded-lg bg-white"
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        {lead.stage === "lost" && (
          <label className="flex flex-col gap-1 text-xs font-semibold text-below-target">
            Lost reason (required)
            <select
              value={selectedLostReason}
              onChange={(e) => handleLostReasonSelect(e.target.value)}
              className="font-normal text-sm text-ink px-2 py-2 min-h-[44px] border border-border-dark rounded-lg bg-white"
            >
              <option value="">Choose...</option>
              {lostReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {lead.stage === "sold" && hasSoldJob && (
          <a
            href="/jobs"
            className="font-semibold inline-flex items-center min-h-[44px] text-accent hover:underline"
          >
            Job added · view
          </a>
        )}
        {lead.stage !== "lost" && lead.stage !== "sold" && (
          <span className="text-[#3D4248]">{lead.next_step || "—"}</span>
        )}
      </td>
      <td className="px-3 py-3">
        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-semibold text-ink hover:text-accent inline-flex items-center min-h-[44px]"
        >
          Edit
        </button>
      </td>
    </tr>
  );
}
