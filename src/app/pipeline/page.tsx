"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { getPipeline, movePipelineCard, updatePipelineDeal } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  MapPin,
  Search,
  ExternalLink,
  GripVertical,
} from "lucide-react";

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
  created_at: string;
  agreements: { id: string; type: string; status: string; monthly_rent: number }[];
}

type StageMap = Record<string, PipelineOutlet[]>;

const STAGES = [
  { key: "lead", label: "Lead", color: "bg-neutral-100 text-neutral-700" },
  { key: "site_visit", label: "Site Visit", color: "bg-blue-100 text-blue-700" },
  { key: "negotiation", label: "Negotiation", color: "bg-amber-100 text-amber-700" },
  { key: "loi_signed", label: "LOI Signed", color: "bg-purple-100 text-purple-700" },
  { key: "fit_out", label: "Fit-out", color: "bg-indigo-100 text-indigo-700" },
  { key: "operational", label: "Operational", color: "bg-emerald-100 text-emerald-700" },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-blue-50 text-blue-700 border-blue-200",
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

// ---------------------------------------------------------------------------
// Pipeline Page
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const [stages, setStages] = useState<StageMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);

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

  // Filter outlets
  function filterOutlets(outlets: PipelineOutlet[]): PipelineOutlet[] {
    return outlets.filter((o) => {
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
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-500">Loading pipeline...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-sm text-red-600">{error}</p>
        <Button variant="outline" onClick={fetchPipeline}>Retry</Button>
      </div>
    );
  }

  const totalOutlets = Object.values(stages).reduce((sum, arr) => sum + arr.length, 0);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Deal Pipeline</h1>
          <p className="text-sm text-neutral-500">
            {totalOutlets} outlet{totalOutlets !== 1 ? "s" : ""} across {STAGES.length} stages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
            <Input
              placeholder="Search outlets..."
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
        </div>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-200px)]">
          {STAGES.map((stage) => {
            const outlets = filterOutlets(stages[stage.key] || []);
            return (
              <div
                key={stage.key}
                className="flex-shrink-0 w-[280px] bg-neutral-50 rounded-lg border border-neutral-200"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between p-3 border-b border-neutral-200">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs font-medium ${stage.color}`}>
                      {stage.label}
                    </Badge>
                    <span className="text-xs text-neutral-400 font-medium">{outlets.length}</span>
                  </div>
                </div>

                {/* Cards */}
                <Droppable droppableId={stage.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`p-2 space-y-2 min-h-[100px] transition-colors ${
                        snapshot.isDraggingOver ? "bg-blue-50/50" : ""
                      }`}
                    >
                      {outlets.map((outlet, index) => (
                        <Draggable key={outlet.id} draggableId={outlet.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`bg-white rounded-lg border p-3 transition-shadow ${
                                dragSnapshot.isDragging
                                  ? "shadow-lg border-blue-300"
                                  : "border-neutral-200 hover:shadow-sm"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div
                                  {...dragProvided.dragHandleProps}
                                  className="mt-0.5 text-neutral-300 hover:text-neutral-500 cursor-grab"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <Link
                                      href={`/outlets/${outlet.id}`}
                                      className="text-sm font-medium truncate hover:underline"
                                    >
                                      {outlet.name}
                                    </Link>
                                    <Link
                                      href={`/outlets/${outlet.id}`}
                                      className="text-neutral-300 hover:text-neutral-500 flex-shrink-0"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </Link>
                                  </div>
                                  <div className="flex items-center gap-1 mt-1">
                                    <MapPin className="w-3 h-3 text-neutral-400" />
                                    <span className="text-xs text-neutral-500 truncate">
                                      {outlet.city || "Unknown"}
                                    </span>
                                  </div>

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
                                      <span className="text-[10px] text-neutral-400">
                                        {daysInStage(outlet.deal_stage_entered_at)}d in stage
                                      </span>
                                    )}
                                  </div>

                                  {/* Rent info */}
                                  {outlet.agreements?.[0]?.monthly_rent > 0 && (
                                    <p className="text-[10px] text-neutral-400 mt-1">
                                      {formatCurrency(outlet.agreements[0].monthly_rent)}/mo
                                    </p>
                                  )}

                                  {/* Notes */}
                                  {outlet.deal_notes && (
                                    <p className="text-[10px] text-neutral-400 mt-1 truncate" title={outlet.deal_notes}>
                                      {outlet.deal_notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
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
  );
}
