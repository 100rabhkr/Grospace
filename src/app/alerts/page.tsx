"use client";

import { useState, useEffect, useMemo } from "react";
import { listAlerts, acknowledgeAlert, snoozeAlert, createReminder, updateReminder, deleteReminder } from "@/lib/api";
import { Pagination } from "@/components/pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell,
  Search,
  CheckCircle2,
  Clock,
  CalendarDays,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Pencil,
  Trash2,
  Loader2,
  List,
  CalendarIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";

// ---------- Types ----------

type AlertType =
  | "lease_expiry"
  | "lock_in_expiry"
  | "escalation"
  | "rent_due"
  | "cam_due"
  | "license_expiry"
  | "renewal_window"
  | "custom";

type AlertSeverity = "high" | "medium" | "low" | "info";

type AlertStatus = "pending" | "sent" | "acknowledged" | "snoozed";

type Alert = {
  id: string;
  org_id: string;
  outlet_id: string;
  agreement_id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  trigger_date: string;
  lead_days: number;
  reference_date: string;
  status: AlertStatus;
  outlets: { name: string; city: string } | null;
  agreements: { type: string; document_filename: string } | null;
};

// ---------- Constants ----------

const alertTypeOptions: { value: AlertType; label: string }[] = [
  { value: "rent_due", label: "Rent Due" },
  { value: "cam_due", label: "CAM Due" },
  { value: "escalation", label: "Escalation" },
  { value: "lease_expiry", label: "Lease Expiry" },
  { value: "license_expiry", label: "License Expiry" },
  { value: "lock_in_expiry", label: "Lock-in Expiry" },
  { value: "renewal_window", label: "Renewal Window" },
  { value: "custom", label: "Custom Reminder" },
];

const severityOptions: { value: AlertSeverity; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "info", label: "Info" },
];

const statusOptions: { value: AlertStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "snoozed", label: "Snoozed" },
];

// ---------- Helpers ----------

function severityDotColor(severity: AlertSeverity): string {
  switch (severity) {
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-amber-500";
    case "low":
      return "bg-[#132337]";
    case "info":
      return "bg-neutral-400";
    default:
      return "bg-neutral-400";
  }
}

function statusColor(status: string): string {
  if (!status) return "bg-neutral-100 text-[#132337]";
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    sent: "bg-blue-100 text-blue-800",
    acknowledged: "bg-emerald-100 text-emerald-800",
    snoozed: "bg-neutral-100 text-[#132337]",
  };
  return map[status] || "bg-neutral-100 text-[#132337]";
}

function statusLabel(status: string): string {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Group alerts by trigger_date (YYYY-MM-DD).
 * Returns entries sorted ascending by date.
 */
function groupByTriggerDate(
  alerts: Alert[]
): { date: string; alerts: Alert[] }[] {
  const map = new Map<string, Alert[]>();
  for (const alert of alerts) {
    const key = alert.trigger_date || "unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(alert);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, alerts]) => ({ date, alerts }));
}

// ---------- Loading Skeleton ----------

function AlertsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="py-4 px-5">
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-1 pt-1">
                <div className="h-3 w-3 rounded-full bg-[#e4e8ef] animate-pulse" />
                <div className="h-2 w-8 bg-[#e4e8ef] rounded animate-pulse" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-[#e4e8ef] rounded animate-pulse w-3/4 max-w-[320px]" />
                    <div className="h-3 bg-[#e4e8ef] rounded animate-pulse w-1/2 max-w-[200px]" />
                  </div>
                  <div className="h-5 w-20 bg-[#e4e8ef] rounded animate-pulse" />
                </div>
                <div className="h-3 bg-[#e4e8ef] rounded animate-pulse w-full max-w-[400px]" />
                <div className="h-px bg-neutral-100" />
                <div className="flex items-center justify-between">
                  <div className="h-3 w-32 bg-[#e4e8ef] rounded animate-pulse" />
                  <div className="flex gap-2">
                    <div className="h-7 w-24 bg-[#e4e8ef] rounded animate-pulse" />
                    <div className="h-7 w-20 bg-[#e4e8ef] rounded animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------- Component ----------

export default function AlertsPage() {
  // Data state
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Local status overrides (for acknowledge / snooze)
  const [alertStates, setAlertStates] = useState<Record<string, AlertStatus>>(
    {}
  );

  // Reminder dialog state
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Alert | null>(null);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderForm, setReminderForm] = useState({
    title: "",
    message: "",
    trigger_date: "",
    severity: "medium" as string,
  });

  // Calendar view state
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // ---------- Fetch alerts ----------

  async function fetchAlerts() {
    try {
      setLoading(true);
      setError(null);
      const data = await listAlerts({ page, page_size: pageSize });
      setAlerts(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load alerts"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ---------- Filtered + grouped alerts ----------

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const effectiveStatus = alertStates[alert.id] || alert.status;
      const outletName = alert.outlets?.name || "";

      if (
        searchQuery &&
        !(alert.title || "").toLowerCase().includes(searchQuery.toLowerCase()) &&
        !(alert.message || "").toLowerCase().includes(searchQuery.toLowerCase()) &&
        !outletName.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      if (typeFilter !== "all" && alert.type !== typeFilter) return false;
      if (severityFilter !== "all" && alert.severity !== severityFilter)
        return false;
      if (statusFilter !== "all" && effectiveStatus !== statusFilter)
        return false;
      return true;
    });
  }, [alerts, searchQuery, typeFilter, severityFilter, statusFilter, alertStates]);

  const groupedAlerts = useMemo(
    () => groupByTriggerDate(filteredAlerts),
    [filteredAlerts]
  );

  // ---------- Actions ----------

  async function handleAcknowledge(alertId: string) {
    setAlertStates((prev) => ({ ...prev, [alertId]: "acknowledged" }));
    try {
      await acknowledgeAlert(alertId);
    } catch {
      // Revert on failure
      setAlertStates((prev) => {
        const next = { ...prev };
        delete next[alertId];
        return next;
      });
    }
  }

  async function handleSnooze(alertId: string, days: number = 7) {
    setAlertStates((prev) => ({ ...prev, [alertId]: "snoozed" }));
    try {
      await snoozeAlert(alertId, days);
    } catch {
      // Revert on failure
      setAlertStates((prev) => {
        const next = { ...prev };
        delete next[alertId];
        return next;
      });
    }
  }

  function openReminderForm(alert?: Alert) {
    if (alert) {
      setEditingReminder(alert);
      setReminderForm({
        title: alert.title,
        message: alert.message || "",
        trigger_date: alert.trigger_date || "",
        severity: alert.severity,
      });
    } else {
      setEditingReminder(null);
      setReminderForm({ title: "", message: "", trigger_date: "", severity: "medium" });
    }
    setShowReminderForm(true);
  }

  async function handleSaveReminder() {
    if (!reminderForm.title || !reminderForm.trigger_date) return;
    setReminderSaving(true);
    try {
      if (editingReminder) {
        await updateReminder(editingReminder.id, reminderForm);
      } else {
        await createReminder(reminderForm);
      }
      setShowReminderForm(false);
      await fetchAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save reminder");
    } finally {
      setReminderSaving(false);
    }
  }

  async function handleDeleteReminder(alertId: string) {
    try {
      await deleteReminder(alertId);
      await fetchAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete reminder");
    }
  }

  function clearFilters() {
    setSearchQuery("");
    setTypeFilter("all");
    setSeverityFilter("all");
    setStatusFilter("all");
  }

  const hasActiveFilters =
    searchQuery !== "" ||
    typeFilter !== "all" ||
    severityFilter !== "all" ||
    statusFilter !== "all";

  // ---------- Calendar helpers ----------

  const alertsByDate = useMemo(() => {
    const map: Record<string, Alert[]> = {};
    for (const alert of filteredAlerts) {
      const date = (alert.trigger_date || "").split("T")[0];
      if (!date) continue;
      if (!map[date]) map[date] = [];
      map[date].push(alert);
    }
    return map;
  }, [filteredAlerts]);

  function getCalendarDays(year: number, month: number) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();

    const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];

    // Fill in days from previous month
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({
        date: d.toISOString().split("T")[0],
        day: d.getDate(),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      days.push({
        date: date.toISOString().split("T")[0],
        day: d,
        isCurrentMonth: true,
      });
    }

    // Fill remaining cells to complete the grid (up to 42 cells = 6 rows)
    while (days.length < 42) {
      const d = new Date(year, month + 1, days.length - startDow - totalDays + 1);
      days.push({
        date: d.toISOString().split("T")[0],
        day: d.getDate(),
        isCurrentMonth: false,
      });
    }

    return days;
  }

  function getMaxSeverityForDate(alerts: Alert[]): string {
    if (alerts.some((a) => a.severity === "high")) return "high";
    if (alerts.some((a) => a.severity === "medium")) return "medium";
    return "low";
  }

  function severityCalendarColor(severity: string): string {
    switch (severity) {
      case "high": return "bg-red-500";
      case "medium": return "bg-amber-500";
      default: return "bg-blue-500";
    }
  }

  const calDays = getCalendarDays(calendarMonth.year, calendarMonth.month);
  const calMonthName = new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const selectedDateAlerts = selectedCalendarDate ? (alertsByDate[selectedCalendarDate] || []) : [];

  // ---------- Render ----------

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader title="Alerts">
        {!loading && (
          <Badge variant="secondary" className="text-sm">
            {total}
          </Badge>
        )}
        <div className="flex items-center gap-1 ml-2 border border-[#e4e8ef] rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded transition-colors ${viewMode === "list" ? "bg-[#132337] text-white" : "text-neutral-500 hover:text-neutral-700"}`}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={`p-1.5 rounded transition-colors ${viewMode === "calendar" ? "bg-[#132337] text-white" : "text-neutral-500 hover:text-neutral-700"}`}
            title="Calendar view"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </div>
      </PageHeader>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-red-200 bg-red-50 text-red-800">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Failed to load alerts</p>
            <p className="text-sm">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Search alerts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Alert Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {alertTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Severity Filter */}
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                {severityOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {filteredAlerts.length} of {alerts.length} alerts
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-sm"
              >
                <X className="h-3 w-3 mr-1" />
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && <AlertsSkeleton />}

      {/* Empty State -- no alerts at all */}
      {!loading && !error && alerts.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-1">No alerts yet</h2>
            <p className="text-sm text-muted-foreground">
              Alerts will appear here once agreements are activated and
              obligations are tracked.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty filtered state */}
      {!loading && !error && alerts.length > 0 && filteredAlerts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              No alerts match your filters.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ============ CALENDAR VIEW ============ */}
      {!loading && !error && viewMode === "calendar" && filteredAlerts.length > 0 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCalendarMonth((prev) => {
                    const d = new Date(prev.year, prev.month - 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="p-1.5 rounded hover:bg-[#f4f6f9] transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-neutral-600" />
                </button>
                <h3 className="text-sm font-semibold text-[#132337]">{calMonthName}</h3>
                <button
                  onClick={() => setCalendarMonth((prev) => {
                    const d = new Date(prev.year, prev.month + 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="p-1.5 rounded hover:bg-[#f4f6f9] transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-neutral-600" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold text-neutral-500 uppercase py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {calDays.map((day, idx) => {
                  const dayAlerts = alertsByDate[day.date] || [];
                  const isToday = day.date === new Date().toISOString().split("T")[0];
                  const isSelected = day.date === selectedCalendarDate;
                  const hasAlerts = dayAlerts.length > 0;

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedCalendarDate(isSelected ? null : day.date)}
                      className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-all ${
                        !day.isCurrentMonth
                          ? "text-neutral-300"
                          : isSelected
                            ? "bg-[#132337] text-white"
                            : isToday
                              ? "bg-[#f4f6f9] font-semibold text-[#132337]"
                              : "text-neutral-700 hover:bg-[#f4f6f9]"
                      }`}
                    >
                      <span>{day.day}</span>
                      {hasAlerts && day.isCurrentMonth && (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : severityCalendarColor(getMaxSeverityForDate(dayAlerts))}`} />
                          {dayAlerts.length > 1 && (
                            <span className={`text-[8px] ${isSelected ? "text-white/80" : "text-neutral-400"}`}>
                              {dayAlerts.length}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#e4e8ef]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[10px] text-neutral-500">High</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-[10px] text-neutral-500">Medium</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[10px] text-neutral-500">Low</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Selected date alerts */}
          {selectedCalendarDate && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-[#132337]">
                  {formatDate(selectedCalendarDate)}
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({selectedDateAlerts.length} alert{selectedDateAlerts.length !== 1 ? "s" : ""})
                </span>
                <button
                  onClick={() => setSelectedCalendarDate(null)}
                  className="ml-auto p-1 rounded hover:bg-[#f4f6f9]"
                >
                  <X className="h-3.5 w-3.5 text-neutral-400" />
                </button>
              </div>

              {selectedDateAlerts.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No alerts on this date.</p>
                  </CardContent>
                </Card>
              ) : (
                selectedDateAlerts.map((alert) => {
                  const effectiveStatus = alertStates[alert.id] || alert.status;
                  return (
                    <Card key={alert.id} className={`transition-opacity ${effectiveStatus === "acknowledged" || effectiveStatus === "snoozed" ? "opacity-60" : ""}`}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-3">
                          <div className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${severityDotColor(alert.severity)}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm text-black">{alert.title}</h3>
                              <Badge variant="outline" className="text-[11px] font-normal">{statusLabel(alert.type)}</Badge>
                              <Badge className={`${statusColor(effectiveStatus)} border-0 text-[11px]`}>{statusLabel(effectiveStatus)}</Badge>
                            </div>
                            {alert.message && <p className="text-sm text-neutral-600 mt-1">{alert.message}</p>}
                            <p className="text-xs text-muted-foreground mt-1">
                              {alert.outlets?.name || "Unknown Outlet"}{alert.outlets?.city ? ` | ${alert.outlets.city}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {effectiveStatus !== "acknowledged" && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAcknowledge(alert.id)}>
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Ack
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ============ LIST VIEW ============ */}
      {/* Alert Cards grouped by trigger date */}
      {!loading &&
        !error &&
        viewMode === "list" &&
        groupedAlerts.map((group) => (
          <div key={group.date} className="space-y-3">
            {/* Date group header */}
            <div className="flex items-center gap-2 pt-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-[#132337]">
                {group.date === "unknown"
                  ? "No Date"
                  : formatDate(group.date)}
              </h2>
              <span className="text-xs text-muted-foreground">
                ({group.alerts.length})
              </span>
            </div>

            {group.alerts.map((alert) => {
              const effectiveStatus =
                alertStates[alert.id] || alert.status;
              const outletName = alert.outlets?.name || "Unknown Outlet";
              const outletCity = alert.outlets?.city || "";

              return (
                <Card
                  key={alert.id}
                  className={`transition-opacity ${
                    effectiveStatus === "acknowledged" ||
                    effectiveStatus === "snoozed"
                      ? "opacity-60"
                      : ""
                  }`}
                >
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start gap-4">
                      {/* Severity Indicator */}
                      <div className="flex flex-col items-center gap-1 pt-1">
                        <div
                          className={`h-3 w-3 rounded-full ${severityDotColor(
                            alert.severity
                          )}`}
                        />
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">
                          {alert.severity}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-sm text-black">
                                {alert.title}
                              </h3>
                              <Badge
                                variant="outline"
                                className="text-[11px] font-normal"
                              >
                                {statusLabel(alert.type)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {outletName}
                              {outletCity && (
                                <>
                                  <span className="mx-1.5 text-neutral-300">
                                    |
                                  </span>
                                  {outletCity}
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              className={`${statusColor(
                                effectiveStatus
                              )} border-0 text-[11px]`}
                            >
                              {statusLabel(effectiveStatus)}
                            </Badge>
                          </div>
                        </div>

                        <p className="text-sm text-neutral-700 mt-2">
                          {alert.message}
                        </p>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#e4e8ef]">
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              <span>
                                Trigger: {formatDate(alert.trigger_date)}
                              </span>
                            </div>
                            {alert.reference_date && (
                              <span>
                                Ref: {formatDate(alert.reference_date)}
                              </span>
                            )}
                            {alert.lead_days != null && (
                              <span>{alert.lead_days}d lead</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Acknowledge */}
                            {effectiveStatus !== "acknowledged" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleAcknowledge(alert.id)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Acknowledge
                              </Button>
                            )}

                            {/* Snooze Dropdown */}
                            {effectiveStatus !== "snoozed" && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                  >
                                    <Clock className="h-3.5 w-3.5 mr-1" />
                                    Snooze
                                    <ChevronDown className="h-3 w-3 ml-1" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleSnooze(alert.id, 7)}
                                  >
                                    Snooze 7 days
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleSnooze(alert.id, 14)}
                                  >
                                    Snooze 14 days
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleSnooze(alert.id, 30)}
                                  >
                                    Snooze 30 days
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}

                            {/* Edit / Delete for custom reminders */}
                            {alert.type === "custom" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => openReminderForm(alert)}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-red-600 hover:text-red-700"
                                  onClick={() => handleDeleteReminder(alert.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))}

      {/* Pagination (list view only) */}
      {!loading && !error && viewMode === "list" && (
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      )}

      {/* Reminder Dialog */}
      <Dialog open={showReminderForm} onOpenChange={setShowReminderForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingReminder ? "Edit Reminder" : "New Custom Reminder"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="reminder-title">Title</Label>
              <Input
                id="reminder-title"
                value={reminderForm.title}
                onChange={(e) => setReminderForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Renewal negotiation deadline"
              />
            </div>
            <div>
              <Label htmlFor="reminder-message">Message (optional)</Label>
              <Input
                id="reminder-message"
                value={reminderForm.message}
                onChange={(e) => setReminderForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Additional details..."
              />
            </div>
            <div>
              <Label htmlFor="reminder-date">Trigger Date</Label>
              <Input
                id="reminder-date"
                type="date"
                value={reminderForm.trigger_date}
                onChange={(e) => setReminderForm((f) => ({ ...f, trigger_date: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="reminder-severity">Severity</Label>
              <Select
                value={reminderForm.severity}
                onValueChange={(v) => setReminderForm((f) => ({ ...f, severity: v }))}
              >
                <SelectTrigger id="reminder-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowReminderForm(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveReminder}
                disabled={reminderSaving || !reminderForm.title || !reminderForm.trigger_date}
              >
                {reminderSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {editingReminder ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
