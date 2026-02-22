"use client";

import { useState, useEffect, useMemo } from "react";
import { listAlerts, acknowledgeAlert, snoozeAlert } from "@/lib/api";
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
  AlertTriangle,
} from "lucide-react";

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
      return "bg-blue-500";
    case "info":
      return "bg-neutral-400";
    default:
      return "bg-neutral-400";
  }
}

function statusColor(status: string): string {
  if (!status) return "bg-neutral-100 text-neutral-600";
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    sent: "bg-blue-100 text-blue-800",
    acknowledged: "bg-emerald-100 text-emerald-800",
    snoozed: "bg-neutral-100 text-neutral-600",
  };
  return map[status] || "bg-neutral-100 text-neutral-600";
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
                <div className="h-3 w-3 rounded-full bg-neutral-200 animate-pulse" />
                <div className="h-2 w-8 bg-neutral-200 rounded animate-pulse" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-neutral-200 rounded animate-pulse w-3/4 max-w-[320px]" />
                    <div className="h-3 bg-neutral-200 rounded animate-pulse w-1/2 max-w-[200px]" />
                  </div>
                  <div className="h-5 w-20 bg-neutral-200 rounded animate-pulse" />
                </div>
                <div className="h-3 bg-neutral-200 rounded animate-pulse w-full max-w-[400px]" />
                <div className="h-px bg-neutral-100" />
                <div className="flex items-center justify-between">
                  <div className="h-3 w-32 bg-neutral-200 rounded animate-pulse" />
                  <div className="flex gap-2">
                    <div className="h-7 w-24 bg-neutral-200 rounded animate-pulse" />
                    <div className="h-7 w-20 bg-neutral-200 rounded animate-pulse" />
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

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Local status overrides (for acknowledge / snooze)
  const [alertStates, setAlertStates] = useState<Record<string, AlertStatus>>(
    {}
  );

  // ---------- Fetch alerts ----------

  useEffect(() => {
    let cancelled = false;

    async function fetchAlerts() {
      try {
        setLoading(true);
        setError(null);
        const data = await listAlerts();
        if (!cancelled) {
          setAlerts(data.alerts || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load alerts"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAlerts();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-neutral-700" />
          <h1 className="text-2xl font-bold tracking-tight text-black">
            Alerts
          </h1>
          {!loading && (
            <Badge variant="secondary" className="text-sm">
              {alerts.length}
            </Badge>
          )}
        </div>
      </div>

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

      {/* Alert Cards grouped by trigger date */}
      {!loading &&
        !error &&
        groupedAlerts.map((group) => (
          <div key={group.date} className="space-y-3">
            {/* Date group header */}
            <div className="flex items-center gap-2 pt-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-neutral-600">
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

                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
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
    </div>
  );
}
