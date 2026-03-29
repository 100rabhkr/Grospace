"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Bell,
  Lock,
  IndianRupee,
  FileText,
  Key,
  Plus,
  AlertOctagon,
  Play,
  X,
} from "lucide-react";
import { listEvents, updateEvent, createEvent } from "@/lib/api";

type LeaseEvent = {
  id: string;
  date_type: string;
  event_type: string;
  date_value: string;
  label: string;
  status: string;
  task_status: string;
  priority: string;
  days_remaining: number;
  amount: number | null;
  notes: string | null;
  assigned_to: string | null;
};

const typeIcons: Record<string, React.ElementType> = {
  lease_expiry: Calendar,
  notice_deadline: Bell,
  lock_in_end: Lock,
  rent_escalation: IndianRupee,
  escalation_due: IndianRupee,
  security_deposit_topup: Key,
  rent_commencement: Clock,
  fit_out_end: FileText,
  renewal_option: Calendar,
  registration_deadline: FileText,
  tds_filing: IndianRupee,
  gst_rcm: IndianRupee,
  insurance_renewal: FileText,
  license_renewal: FileText,
  custom: Calendar,
};

const priorityColors: Record<string, string> = {
  critical: "text-rose-600 bg-rose-50",
  high: "text-amber-600 bg-amber-50",
  medium: "text-blue-600 bg-blue-50",
  low: "text-slate-500 bg-slate-50",
};

const taskStatusColors: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  overdue: "bg-rose-100 text-rose-700",
  escalated: "bg-red-100 text-red-800",
};

function urgencyColor(days: number): string {
  if (days < 0) return "text-slate-400";
  if (days <= 14) return "text-rose-600";
  if (days <= 30) return "text-rose-500";
  if (days <= 60) return "text-amber-600";
  if (days <= 90) return "text-amber-500";
  return "text-emerald-600";
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function formatINR(n: number | null): string {
  if (!n) return "";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

export function CriticalDatesCard({ agreementId }: { agreementId: string }) {
  const [events, setEvents] = useState<LeaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newType, setNewType] = useState("custom");
  const [newPriority, setNewPriority] = useState("medium");

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listEvents(agreementId);
      setEvents(data.events || data.critical_dates || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [agreementId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleStatusChange = async (id: string, taskStatus: string) => {
    try {
      await updateEvent(id, { task_status: taskStatus });
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, task_status: taskStatus } : e)));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddEvent = async () => {
    if (!newLabel || !newDate) return;
    try {
      const result = await createEvent({
        agreement_id: agreementId,
        date_value: newDate,
        label: newLabel,
        event_type: newType,
        date_type: newType === "custom" ? "custom" : newType,
        priority: newPriority,
      });
      if (result.event) {
        setEvents((prev) => [...prev, { ...result.event, days_remaining: Math.ceil((new Date(newDate).getTime() - Date.now()) / 86400000) }]);
      }
      setNewLabel("");
      setNewDate("");
      setShowAdd(false);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-sm">Loading events...</span>
      </div>
    );
  }

  const upcoming = events.filter((e) => e.days_remaining >= 0 && e.task_status !== "completed");
  const overdue = events.filter((e) => e.days_remaining < 0 && e.task_status !== "completed");

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Lease Events</span>
          {overdue.length > 0 && (
            <Badge className="text-[9px] bg-rose-100 text-rose-700 border-0">
              {overdue.length} overdue
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {upcoming.length} upcoming
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? <X className="h-3 w-3" /> : <><Plus className="h-3 w-3 mr-1" /> Add</>}
        </Button>
      </div>

      {showAdd && (
        <div className="px-4 py-3 border-b bg-muted/30 space-y-2">
          <Input
            placeholder="Event label (e.g., Insurance renewal)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="flex gap-2">
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-8 text-xs flex-1" />
            <Select value={newPriority} onValueChange={setNewPriority}>
              <SelectTrigger className="h-8 text-xs w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="renewal_option">Renewal</SelectItem>
                <SelectItem value="insurance_renewal">Insurance</SelectItem>
                <SelectItem value="license_renewal">License</SelectItem>
                <SelectItem value="registration_deadline">Registration</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-7 text-xs w-full" onClick={handleAddEvent} disabled={!newLabel || !newDate}>
            Create Event
          </Button>
        </div>
      )}

      <CardContent className="p-0">
        {events.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No events yet. Events are auto-generated on extraction.
          </div>
        ) : (
          <div className="divide-y">
            {events.map((entry) => {
              const Icon = typeIcons[entry.event_type] || typeIcons[entry.date_type] || Calendar;
              const isCompleted = entry.task_status === "completed";
              const isOverdue = entry.days_remaining < 0 && !isCompleted;

              return (
                <div key={entry.id} className={`flex items-center gap-3 px-4 py-2.5 group ${isCompleted ? "opacity-50" : ""}`}>
                  <Icon className={`h-4 w-4 flex-shrink-0 ${urgencyColor(entry.days_remaining)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-xs font-medium truncate ${isCompleted ? "line-through" : ""}`}>{entry.label}</p>
                      <Badge className={`text-[8px] px-1 py-0 ${priorityColors[entry.priority] || priorityColors.medium}`}>
                        {entry.priority}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{formatDate(entry.date_value)}</span>
                      {entry.amount && <span className="text-[10px] font-medium">{formatINR(entry.amount)}</span>}
                      <Badge className={`text-[8px] px-1 py-0 ${taskStatusColors[entry.task_status] || taskStatusColors.pending}`}>
                        {entry.task_status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!isCompleted && (
                      <span className={`text-xs font-semibold tabular-nums ${urgencyColor(entry.days_remaining)}`}>
                        {isOverdue ? `${Math.abs(entry.days_remaining)}d ago` : `${entry.days_remaining}d`}
                      </span>
                    )}
                    {entry.task_status === "pending" && !isOverdue && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => handleStatusChange(entry.id, "in_progress")} title="Start task">
                        <Play className="h-3 w-3" />
                      </Button>
                    )}
                    {(entry.task_status === "in_progress" || isOverdue) && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => handleStatusChange(entry.id, "completed")} title="Mark complete">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      </Button>
                    )}
                    {isOverdue && entry.task_status !== "escalated" && (
                      <AlertOctagon className="h-3.5 w-3.5 text-rose-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
