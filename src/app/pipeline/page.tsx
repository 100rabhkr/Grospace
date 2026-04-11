"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from "@hello-pangea/dnd";
import { getPipeline, movePipelineCard, updatePipelineDeal, createOutlet } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  MapPin,
  Search,
  ExternalLink,
  GripVertical,
  ChevronRight,
  Ruler,
  Building2,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineOutlet {
  id: string;
  name: string;
  city: string;
  status: string;
  deal_stage: string;
  deal_stage_entered_at: string | null;
  deal_notes: string | null;
  deal_priority: string | null;
  property_type: string | null;
  super_area_sqft: number | null;
  created_at: string;
  agreements: { id: string; type: string; status: string; monthly_rent: number }[];
}

type StageMap = Record<string, PipelineOutlet[]>;

const STAGES = [
  { key: "lead", label: "Lead", color: "bg-muted text-foreground" },
  { key: "site_visit", label: "Site Visit", color: "bg-muted text-foreground" },
  { key: "negotiation", label: "Negotiation", color: "bg-muted text-foreground" },
  { key: "loi", label: "LOI", color: "bg-muted text-foreground" },
  { key: "agreement", label: "Agreement", color: "bg-muted text-foreground" },
  { key: "fitout", label: "Fitout", color: "bg-muted text-foreground" },
  { key: "operational", label: "Operational", color: "bg-emerald-50 text-emerald-700" },
  { key: "won", label: "Won (Signed)", color: "bg-emerald-100 text-emerald-800" },
  { key: "closed", label: "Closed", color: "bg-rose-50 text-rose-700" },
  { key: "abandoned", label: "Abandoned", color: "bg-muted text-muted-foreground" },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-rose-50 text-rose-700 border-rose-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-muted text-foreground border-border",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysInStage(enteredAt: string | null): number | null {
  if (!enteredAt) return null;
  const diff = Date.now() - new Date(enteredAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPropertyType(type: string | null): string {
  if (!type) return "";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Portal for drag items — fixes cursor lag when dragging inside scrollable containers
// ---------------------------------------------------------------------------

function getDropStyle(style: React.CSSProperties | undefined, snapshot: DraggableStateSnapshot) {
  if (!style) return {};
  // When dropping, skip the drop animation — snap instantly
  if (snapshot.isDropAnimating) {
    return { ...style, transitionDuration: "0.001s" };
  }
  return style;
}

function PortalAwareDraggable({
  provided,
  snapshot,
  children,
}: {
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  children: React.ReactNode;
}) {
  const el = (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      style={getDropStyle(provided.draggableProps.style, snapshot)}
    >
      {children}
    </div>
  );

  if (snapshot.isDragging) {
    return createPortal(el, document.body);
  }
  return el;
}

// ---------------------------------------------------------------------------
// Pipeline Page
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const [stages, setStages] = useState<StageMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadCity, setNewLeadCity] = useState("");
  const [creatingLead, setCreatingLead] = useState(false);

  const fetchPipeline = useCallback(async () => {
    try {
      setError(null);
      const data = await getPipeline();
      setStages(data.stages || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  async function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceStage = source.droppableId;
    const destStage = destination.droppableId;

    // Optimistic update
    setStages((prev) => {
      const next = { ...prev };
      const sourceList = [...(next[sourceStage] || [])];
      const destList = sourceStage === destStage ? sourceList : [...(next[destStage] || [])];

      const [moved] = sourceList.splice(source.index, 1);
      if (!moved) return prev;

      moved.deal_stage = destStage;
      if (sourceStage !== destStage) {
        moved.deal_stage_entered_at = new Date().toISOString();
      }
      destList.splice(destination.index, 0, moved);

      next[sourceStage] = sourceList;
      next[destStage] = destList;
      return next;
    });

    // API call
    if (sourceStage !== destStage) {
      try {
        await movePipelineCard(draggableId, destStage);
      } catch {
        fetchPipeline(); // Revert on error
      }
    }
  }

  async function handlePriorityToggle(outletId: string, currentPriority: string | null) {
    const cycle = ["low", "medium", "high"];
    const idx = cycle.indexOf(currentPriority || "medium");
    const next = cycle[(idx + 1) % cycle.length];

    // Optimistic update
    setStages((prev) => {
      const next_ = { ...prev };
      for (const key of Object.keys(next_)) {
        next_[key] = next_[key].map((o) =>
          o.id === outletId ? { ...o, deal_priority: next } : o
        );
      }
      return next_;
    });

    try {
      await updatePipelineDeal(outletId, { deal_priority: next });
    } catch {
      fetchPipeline();
    }
  }

  // Mobile stage move (via select dropdown)
  async function handleMobileStageChange(outletId: string, currentStage: string, newStage: string) {
    if (currentStage === newStage) return;
    setStages((prev) => {
      const next = { ...prev };
      const sourceList = [...(next[currentStage] || [])];
      const idx = sourceList.findIndex((o) => o.id === outletId);
      if (idx === -1) return prev;
      const [moved] = sourceList.splice(idx, 1);
      moved.deal_stage = newStage;
      moved.deal_stage_entered_at = new Date().toISOString();
      next[currentStage] = sourceList;
      next[newStage] = [...(next[newStage] || []), moved];
      return next;
    });
    try {
      await movePipelineCard(outletId, newStage);
    } catch {
      fetchPipeline();
    }
  }

  // Filter outlets
  function filterOutlets(outlets: PipelineOutlet[], stageKey?: string): PipelineOutlet[] {
    return outlets.filter((o) => {
      // Filter out operational outlets from early stages (lead, site_visit, negotiation)
      if (stageKey && ["lead", "site_visit", "negotiation"].includes(stageKey)) {
        if (o.status === "operational") return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!o.name.toLowerCase().includes(q) && !o.city.toLowerCase().includes(q)) return false;
      }
      if (priorityFilter && (o.deal_priority || "medium") !== priorityFilter) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading pipeline...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-sm text-rose-600">{error}</p>
        <Button variant="outline" onClick={fetchPipeline}>Retry</Button>
      </div>
    );
  }

  const totalLeads = Object.values(stages).reduce((sum, arr) => sum + arr.length, 0);
  const activeDeals = (stages["negotiation"]?.length || 0) + (stages["loi"]?.length || 0) + (stages["agreement"]?.length || 0) + (stages["fitout"]?.length || 0);
  const operationalCount = stages["operational"]?.length || 0;
  const conversionRate = totalLeads > 0 ? Math.round((operationalCount / totalLeads) * 100) : 0;
  const closedCount = operationalCount + (stages["closed"]?.length || 0);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <PageHeader title={<span className="flex items-center gap-2">Pipeline <Badge variant="outline" className="text-[10px] font-medium">Beta</Badge></span>} description={`${totalLeads} lead${totalLeads !== 1 ? "s" : ""} across ${STAGES.length} stages`}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              className="pl-8 h-8 w-48 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            {["high", "medium", "low"].map((p) => (
              <Button
                key={p}
                variant={priorityFilter === p ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs capitalize"
                onClick={() => setPriorityFilter(priorityFilter === p ? null : p)}
              >
                {p}
              </Button>
            ))}
          </div>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowCreateLead(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create New Lead
          </Button>
        </div>
      </PageHeader>

      {/* Top summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border border-y border-border">
        <div className="px-5 py-4">
          <p className="text-micro mb-1.5">Total Leads</p>
          <p className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{totalLeads}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-micro mb-1.5">Active Deals</p>
          <p className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{activeDeals}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">In negotiation</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-micro mb-1.5">Conversion Rate</p>
          <p className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{conversionRate}%</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">Lead → operational</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-micro mb-1.5">Closed</p>
          <p className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{closedCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">Operational + won</p>
        </div>
      </div>

      {/* Mobile List View — stacked cards grouped by stage */}
      <div className="block lg:hidden space-y-4">
        {STAGES.map((stage) => {
          const outlets = filterOutlets(stages[stage.key] || [], stage.key);
          if (outlets.length === 0) return null;
          return (
            <div key={stage.key}>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className={`text-xs font-medium ${stage.color}`}>
                  {stage.label}
                </Badge>
                <span className="text-xs text-muted-foreground font-medium">{outlets.length}</span>
              </div>
              <div className="space-y-2">
                {outlets.map((outlet) => (
                  <div
                    key={outlet.id}
                    className="bg-card rounded-lg border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/outlets/${outlet.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {outlet.name}
                        </Link>
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground truncate">
                            {outlet.city || "Unknown"}
                          </span>
                        </div>
                      </div>
                      <Link
                        href={`/outlets/${outlet.id}`}
                        className="text-muted-foreground hover:text-foreground mt-0.5"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>

                    {/* Area + Property Type */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {outlet.super_area_sqft != null && outlet.super_area_sqft > 0 && (
                        <div className="flex items-center gap-1">
                          <Ruler className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {Number(outlet.super_area_sqft).toLocaleString()} sq ft
                          </span>
                        </div>
                      )}
                      {outlet.property_type && (
                        <div className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {formatPropertyType(outlet.property_type)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <button
                        onClick={() => handlePriorityToggle(outlet.id, outlet.deal_priority)}
                        className="focus:outline-none"
                        title="Click to cycle priority"
                      >
                        <Badge
                          variant="outline"
                          className={`text-[10px] cursor-pointer ${
                            PRIORITY_COLORS[outlet.deal_priority || "medium"]
                          }`}
                        >
                          {(outlet.deal_priority || "medium").toUpperCase()}
                        </Badge>
                      </button>
                      {daysInStage(outlet.deal_stage_entered_at) != null && (
                        <span className="text-[10px] text-muted-foreground">
                          {daysInStage(outlet.deal_stage_entered_at)}d in stage
                        </span>
                      )}
                      {outlet.agreements?.[0]?.monthly_rent > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatCurrency(outlet.agreements[0].monthly_rent)}/mo
                        </span>
                      )}
                    </div>

                    {/* Mobile stage move */}
                    <div className="mt-2">
                      <Select
                        value={outlet.deal_stage}
                        onValueChange={(val) => handleMobileStageChange(outlet.id, outlet.deal_stage, val)}
                      >
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map((s) => (
                            <SelectItem key={s.key} value={s.key} className="text-xs">
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Kanban Board — hidden on mobile */}
      <div className="hidden lg:block">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-3 min-h-[calc(100vh-160px)]">
            {STAGES.map((stage) => {
              const outlets = filterOutlets(stages[stage.key] || [], stage.key);
              return (
                <div
                  key={stage.key}
                  className="flex-shrink-0 w-[260px] bg-muted/50 rounded-lg"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-foreground/70 truncate">
                        {stage.label}
                      </span>
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-background text-[10px] font-semibold text-foreground border border-border">
                        {outlets.length}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <Droppable droppableId={stage.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`px-2 pb-2 space-y-2 min-h-[120px] transition-colors duration-base rounded-b-lg ${
                          snapshot.isDraggingOver ? "bg-muted" : ""
                        }`}
                      >
                        {outlets.map((outlet, index) => (
                          <Draggable key={outlet.id} draggableId={outlet.id} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <PortalAwareDraggable provided={dragProvided} snapshot={dragSnapshot}>
                                <div
                                  className={`bg-card rounded-lg border border-border p-2.5 transition-all duration-base ease-out-quint ${
                                    dragSnapshot.isDragging
                                      ? "elevation-3 border-border-strong w-[240px] rotate-1"
                                      : "hover:elevation-1 hover:border-border-strong"
                                  } ${
                                    (outlet.deal_priority || "medium") === "high" ? "border-l-[3px] border-l-destructive" :
                                    (outlet.deal_priority || "medium") === "low" ? "border-l-[3px] border-l-foreground/20" :
                                    "border-l-[3px] border-l-warning"
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <div className="mt-0.5 text-neutral-300 hover:text-muted-foreground cursor-grab">
                                      <GripVertical className="w-3.5 h-3.5" />
                                    </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                      <Link
                                        href={`/outlets/${outlet.id}`}
                                        className="text-sm font-semibold truncate hover:underline"
                                      >
                                        {outlet.name}
                                      </Link>
                                      <Link
                                        href={`/outlets/${outlet.id}`}
                                        className="text-neutral-300 hover:text-muted-foreground flex-shrink-0"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </Link>
                                    </div>

                                    {/* Location */}
                                    <div className="flex items-center gap-1 mt-1">
                                      <MapPin className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-xs text-foreground truncate">
                                        {outlet.city || "Unknown"}
                                      </span>
                                    </div>

                                    {/* Area + Property Type */}
                                    <div className="flex items-center gap-3 mt-1.5">
                                      {outlet.super_area_sqft != null && outlet.super_area_sqft > 0 && (
                                        <div className="flex items-center gap-1">
                                          <Ruler className="w-3 h-3 text-muted-foreground" />
                                          <span className="text-xs text-foreground">
                                            {Number(outlet.super_area_sqft).toLocaleString()} sq ft
                                          </span>
                                        </div>
                                      )}
                                      {outlet.property_type && (
                                        <div className="flex items-center gap-1">
                                          <Building2 className="w-3 h-3 text-muted-foreground" />
                                          <span className="text-xs text-foreground">
                                            {formatPropertyType(outlet.property_type)}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Rent quoted */}
                                    {outlet.agreements?.[0]?.monthly_rent > 0 && (
                                      <p className="text-xs font-medium text-foreground mt-1.5">
                                        {formatCurrency(outlet.agreements[0].monthly_rent)}/mo
                                      </p>
                                    )}

                                    {/* Priority + Days */}
                                    <div className="flex items-center gap-2 mt-2">
                                      <button
                                        onClick={() => handlePriorityToggle(outlet.id, outlet.deal_priority)}
                                        className="focus:outline-none"
                                        title="Click to cycle priority"
                                      >
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] cursor-pointer ${
                                            PRIORITY_COLORS[outlet.deal_priority || "medium"]
                                          }`}
                                        >
                                          {(outlet.deal_priority || "medium").toUpperCase()}
                                        </Badge>
                                      </button>
                                      {daysInStage(outlet.deal_stage_entered_at) != null && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {daysInStage(outlet.deal_stage_entered_at)}d in stage
                                        </span>
                                      )}
                                    </div>

                                    {/* Notes */}
                                    {outlet.deal_notes && (
                                      <p className="text-[10px] text-muted-foreground mt-1 truncate" title={outlet.deal_notes}>
                                        {outlet.deal_notes}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              </PortalAwareDraggable>
                            )}
                          </Draggable>
                        ))}
                        {outlets.length === 0 && (
                          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                            No leads in this stage
                          </div>
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      {/* Create New Lead Dialog */}
      {showCreateLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 space-y-4 shadow-xl w-full">
            <h3 className="text-lg font-semibold">Create New Lead</h3>
            <p className="text-xs text-muted-foreground">Create a new outlet as a lead in the pipeline.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Outlet Name *</label>
                <Input value={newLeadName} onChange={(e) => setNewLeadName(e.target.value)} placeholder="e.g. Le Fresh Sector 47" />
                {newLeadName.trim() && (() => {
                  const existing = Object.values(stages).flat().find(o => o.name.toLowerCase() === newLeadName.trim().toLowerCase());
                  if (existing) return (
                    <p className="text-[10px] text-amber-600 mt-1">
                      An outlet named &quot;{existing.name}&quot; already exists in {existing.deal_stage?.replace(/_/g, " ")} stage.
                    </p>
                  );
                  return null;
                })()}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">City</label>
                <Input value={newLeadCity} onChange={(e) => setNewLeadCity(e.target.value)} placeholder="e.g. Gurugram" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowCreateLead(false); setNewLeadName(""); setNewLeadCity(""); }}>Cancel</Button>
              <Button size="sm" disabled={creatingLead || !newLeadName.trim()} onClick={async () => {
                setCreatingLead(true);
                try {
                  const data = await createOutlet({ name: newLeadName, city: newLeadCity || undefined });
                  setShowCreateLead(false);
                  setNewLeadName("");
                  setNewLeadCity("");
                  window.location.href = `/outlets/${data.outlet?.id || data.id}`;
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed to create lead");
                } finally {
                  setCreatingLead(false);
                }
              }}>
                {creatingLead ? "Creating..." : "Create Lead"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
