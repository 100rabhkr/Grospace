"use client";

import { useState, useMemo } from "react";
import {
  alerts,
  organizations,
  outlets,
  formatDate,
  statusColor,
  statusLabel,
  type AlertType,
  type AlertSeverity,
  type AlertStatus,
} from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  UserPlus,
  Plus,
  CalendarDays,
  Repeat,
  X,
  ChevronDown,
} from "lucide-react";

// ---------- Types ----------

type Reminder = {
  id: string;
  title: string;
  description: string;
  date: string;
  recurrence: "one-time" | "monthly" | "quarterly" | "yearly";
  outletId: string | null;
  assignee: string;
  createdAt: string;
};

// ---------- Sample reminders ----------

const sampleReminders: Reminder[] = [
  {
    id: "rem-1",
    title: "Renew fire NOC for GFB Connaught Place",
    description: "Fire NOC expires end of March. Contact fire department for renewal process.",
    date: "2026-03-15",
    recurrence: "yearly",
    outletId: "out-4",
    assignee: "Srabhjot Singh",
    createdAt: "2026-02-10",
  },
  {
    id: "rem-2",
    title: "Review Tan Coffee Cyber Hub revenue share",
    description: "Check actual vs. MGLR for Q1 2026 and recalculate if revenue share exceeds minimum guarantee.",
    date: "2026-04-05",
    recurrence: "quarterly",
    outletId: "out-2",
    assignee: "Srabhjot Singh",
    createdAt: "2026-01-20",
  },
  {
    id: "rem-3",
    title: "Follow up on Burgerama Sector 29 agreement confirmation",
    description: "Agreement agr-8 is still in review status. Follow up with legal team.",
    date: "2026-02-28",
    recurrence: "one-time",
    outletId: "out-9",
    assignee: "Srabhjot Singh",
    createdAt: "2026-02-15",
  },
  {
    id: "rem-4",
    title: "Collect monthly revenue data from all outlets",
    description: "Request updated revenue figures from brand operators for dashboard and rent-to-revenue analysis.",
    date: "2026-03-01",
    recurrence: "monthly",
    outletId: null,
    assignee: "Srabhjot Singh",
    createdAt: "2026-02-01",
  },
];

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
];

const statusOptions: { value: AlertStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "snoozed", label: "Snoozed" },
];

const recurrenceOptions: { value: Reminder["recurrence"]; label: string }[] = [
  { value: "one-time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
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
    default:
      return "bg-neutral-400";
  }
}


function getOutletName(outletId: string | null): string {
  if (!outletId) return "All Outlets";
  const outlet = outlets.find((o) => o.id === outletId);
  return outlet ? outlet.name : outletId;
}

function getOrgNameForAlert(orgId: string): string {
  const org = organizations.find((o) => o.id === orgId);
  return org ? org.name : orgId;
}

// ---------- Component ----------

export default function AlertsPage() {
  // All Alerts filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");

  // Alert local state (for acknowledge / snooze)
  const [alertStates, setAlertStates] = useState<Record<string, AlertStatus>>({});

  // Custom Reminders
  const [reminders, setReminders] = useState<Reminder[]>(sampleReminders);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newReminder, setNewReminder] = useState<Omit<Reminder, "id" | "createdAt">>({
    title: "",
    description: "",
    date: "",
    recurrence: "one-time",
    outletId: null,
    assignee: "",
  });

  // ---------- Filtered alerts ----------

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const effectiveStatus = alertStates[alert.id] || alert.status;

      if (
        searchQuery &&
        !alert.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !alert.message.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !alert.outletName.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      if (typeFilter !== "all" && alert.type !== typeFilter) return false;
      if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
      if (statusFilter !== "all" && effectiveStatus !== statusFilter) return false;
      if (orgFilter !== "all" && alert.orgId !== orgFilter) return false;
      return true;
    });
  }, [searchQuery, typeFilter, severityFilter, statusFilter, orgFilter, alertStates]);

  // ---------- Alert actions ----------

  function handleAcknowledge(alertId: string) {
    setAlertStates((prev) => ({ ...prev, [alertId]: "acknowledged" }));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleSnooze(alertId: string, days: number) {
    setAlertStates((prev) => ({ ...prev, [alertId]: "snoozed" }));
    // In a real app, this would set a snooze-until date
  }

  function handleCreateReminder() {
    if (!newReminder.title || !newReminder.date) return;
    const reminder: Reminder = {
      ...newReminder,
      id: `rem-${Date.now()}`,
      createdAt: new Date().toISOString().split("T")[0],
    };
    setReminders((prev) => [reminder, ...prev]);
    setNewReminder({
      title: "",
      description: "",
      date: "",
      recurrence: "one-time",
      outletId: null,
      assignee: "",
    });
    setShowCreateForm(false);
  }

  function handleDeleteReminder(reminderId: string) {
    setReminders((prev) => prev.filter((r) => r.id !== reminderId));
  }

  function clearFilters() {
    setSearchQuery("");
    setTypeFilter("all");
    setSeverityFilter("all");
    setStatusFilter("all");
    setOrgFilter("all");
  }

  const hasActiveFilters =
    searchQuery || typeFilter !== "all" || severityFilter !== "all" || statusFilter !== "all" || orgFilter !== "all";

  return (
    <div className="space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-neutral-700" />
          <h1 className="text-2xl font-bold tracking-tight text-black">Alerts</h1>
          <Badge variant="secondary" className="text-sm">
            {alerts.length}
          </Badge>
        </div>
      </div>

      {/* ---------- Tabs ---------- */}
      <Tabs defaultValue="all-alerts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all-alerts">All Alerts</TabsTrigger>
          <TabsTrigger value="custom-reminders">Custom Reminders</TabsTrigger>
        </TabsList>

        {/* ==================== ALL ALERTS TAB ==================== */}
        <TabsContent value="all-alerts" className="space-y-4">
          {/* Filter Bar */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
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

                {/* Org / Brand Filter */}
                <Select value={orgFilter} onValueChange={setOrgFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
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
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-sm">
                    <X className="h-3 w-3 mr-1" />
                    Clear filters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alert Cards */}
          <div className="space-y-3">
            {filteredAlerts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Bell className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No alerts match your filters.</p>
                </CardContent>
              </Card>
            ) : (
              filteredAlerts.map((alert) => {
                const effectiveStatus = alertStates[alert.id] || alert.status;
                return (
                  <Card
                    key={alert.id}
                    className={`transition-opacity ${effectiveStatus === "acknowledged" || effectiveStatus === "snoozed" ? "opacity-60" : ""}`}
                  >
                    <CardContent className="py-4 px-5">
                      <div className="flex items-start gap-4">
                        {/* Severity Indicator */}
                        <div className="flex flex-col items-center gap-1 pt-1">
                          <div className={`h-3 w-3 rounded-full ${severityDotColor(alert.severity)}`} />
                          <span className="text-[10px] font-medium text-muted-foreground uppercase">
                            {alert.severity}
                          </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-sm text-black">{alert.title}</h3>
                                <Badge variant="outline" className="text-[11px] font-normal">
                                  {statusLabel(alert.type)}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {alert.outletName}
                                <span className="mx-1.5 text-neutral-300">|</span>
                                {getOrgNameForAlert(alert.orgId)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className={`${statusColor(effectiveStatus)} border-0 text-[11px]`}>
                                {statusLabel(effectiveStatus)}
                              </Badge>
                            </div>
                          </div>

                          <p className="text-sm text-neutral-700 mt-2">{alert.message}</p>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <CalendarDays className="h-3.5 w-3.5" />
                              <span>Triggered: {formatDate(alert.triggerDate)}</span>
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
                                    <Button variant="outline" size="sm" className="h-7 text-xs">
                                      <Clock className="h-3.5 w-3.5 mr-1" />
                                      Snooze
                                      <ChevronDown className="h-3 w-3 ml-1" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleSnooze(alert.id, 7)}>
                                      Snooze 7 days
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSnooze(alert.id, 14)}>
                                      Snooze 14 days
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSnooze(alert.id, 30)}>
                                      Snooze 30 days
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}

                              {/* Assign */}
                              <Button variant="outline" size="sm" className="h-7 text-xs">
                                <UserPlus className="h-3.5 w-3.5 mr-1" />
                                Assign
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* ==================== CUSTOM REMINDERS TAB ==================== */}
        <TabsContent value="custom-reminders" className="space-y-4">
          {/* Create Reminder Button / Form */}
          {!showCreateForm ? (
            <div className="flex justify-end">
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Reminder
              </Button>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">New Reminder</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Title */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="rem-title" className="text-sm font-medium">
                      Title
                    </Label>
                    <Input
                      id="rem-title"
                      placeholder="Reminder title"
                      value={newReminder.title}
                      onChange={(e) =>
                        setNewReminder((prev) => ({ ...prev, title: e.target.value }))
                      }
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="rem-desc" className="text-sm font-medium">
                      Description
                    </Label>
                    <Textarea
                      id="rem-desc"
                      placeholder="Optional description..."
                      value={newReminder.description}
                      onChange={(e) =>
                        setNewReminder((prev) => ({ ...prev, description: e.target.value }))
                      }
                      rows={3}
                    />
                  </div>

                  {/* Date */}
                  <div className="space-y-1.5">
                    <Label htmlFor="rem-date" className="text-sm font-medium">
                      Date
                    </Label>
                    <Input
                      id="rem-date"
                      type="date"
                      value={newReminder.date}
                      onChange={(e) =>
                        setNewReminder((prev) => ({ ...prev, date: e.target.value }))
                      }
                    />
                  </div>

                  {/* Recurrence */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Recurrence</Label>
                    <Select
                      value={newReminder.recurrence}
                      onValueChange={(val) =>
                        setNewReminder((prev) => ({
                          ...prev,
                          recurrence: val as Reminder["recurrence"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Recurrence" />
                      </SelectTrigger>
                      <SelectContent>
                        {recurrenceOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Linked Outlet */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Linked Outlet</Label>
                    <Select
                      value={newReminder.outletId || "none"}
                      onValueChange={(val) =>
                        setNewReminder((prev) => ({
                          ...prev,
                          outletId: val === "none" ? null : val,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select outlet" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {outlets.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Assignee */}
                  <div className="space-y-1.5">
                    <Label htmlFor="rem-assignee" className="text-sm font-medium">
                      Assignee
                    </Label>
                    <Input
                      id="rem-assignee"
                      placeholder="Assignee name"
                      value={newReminder.assignee}
                      onChange={(e) =>
                        setNewReminder((prev) => ({ ...prev, assignee: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateReminder}
                    disabled={!newReminder.title || !newReminder.date}
                  >
                    Create Reminder
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reminder List */}
          <div className="space-y-3">
            {reminders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CalendarDays className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">
                    No custom reminders yet. Create one to get started.
                  </p>
                </CardContent>
              </Card>
            ) : (
              reminders.map((reminder) => (
                <Card key={reminder.id}>
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start gap-4">
                      <div className="pt-0.5">
                        <div className="h-9 w-9 rounded-lg bg-neutral-100 flex items-center justify-center">
                          <Repeat className="h-4 w-4 text-neutral-600" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <h3 className="font-semibold text-sm text-black">{reminder.title}</h3>
                            {reminder.description && (
                              <p className="text-sm text-neutral-600">{reminder.description}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-neutral-400 hover:text-red-500"
                            onClick={() => handleDeleteReminder(reminder.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            <span>{formatDate(reminder.date)}</span>
                          </div>
                          <Badge variant="outline" className="text-[11px]">
                            {statusLabel(reminder.recurrence)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {getOutletName(reminder.outletId)}
                          </span>
                          {reminder.assignee && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <UserPlus className="h-3 w-3" />
                              <span>{reminder.assignee}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
