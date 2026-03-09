"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellDot,
  CalendarClock,
  TrendingUp,
  IndianRupee,
  ShieldAlert,
  AlertTriangle,
  FileText,
  Clock,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { listAlerts, acknowledgeAlert } from "@/lib/api";

// ---------- Types ----------

interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  trigger_date: string;
  outlet_id?: string;
  agreement_id?: string;
  created_at?: string;
  outlets?: { name: string; city?: string } | null;
  agreements?: { type: string; document_filename?: string } | null;
}

// ---------- Helpers ----------

function getAlertIcon(type: string) {
  switch (type) {
    case "lease_expiry":
    case "lock_in_expiry":
      return CalendarClock;
    case "escalation":
      return TrendingUp;
    case "rent_due":
    case "cam_due":
      return IndianRupee;
    case "risk_flag":
      return ShieldAlert;
    case "license_expiry":
    case "renewal_window":
      return FileText;
    case "custom":
      return Clock;
    default:
      return AlertTriangle;
  }
}

function severityDot(severity: string): string {
  switch (severity) {
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-amber-500";
    case "low":
      return "bg-[#132337]";
    default:
      return "bg-[#132337]/40";
  }
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const absDiff = Math.abs(diff);
  const mins = Math.floor(absDiff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function groupAlertsByPeriod(alerts: Alert[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgoStart = new Date(todayStart.getTime() - 7 * 86400000);

  const today: Alert[] = [];
  const thisWeek: Alert[] = [];
  const earlier: Alert[] = [];

  for (const a of alerts) {
    const d = new Date(a.trigger_date || a.created_at || "");
    if (d >= todayStart) today.push(a);
    else if (d >= weekAgoStart) thisWeek.push(a);
    else earlier.push(a);
  }

  return { today, thisWeek, earlier };
}

// ---------- Sub-components ----------

function NotificationItem({
  alert,
  onAcknowledge,
  onNavigate,
}: {
  alert: Alert;
  onAcknowledge: (id: string) => void;
  onNavigate: () => void;
}) {
  const Icon = getAlertIcon(alert.type);
  const router = useRouter();
  const outletName = alert.outlets?.name || "";
  const displayTitle = outletName || alert.title;
  const displaySub = outletName ? alert.title : alert.message;

  function handleClick() {
    if (alert.outlet_id) {
      router.push(`/outlets/${alert.outlet_id}`);
    } else if (alert.agreement_id) {
      router.push(`/agreements/${alert.agreement_id}`);
    } else {
      router.push("/alerts");
    }
    onNavigate();
  }

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 hover:bg-[#f4f6f9] cursor-pointer transition-colors group border-b border-[#e4e8ef]/50 last:border-0"
      onClick={handleClick}
    >
      {/* Severity dot */}
      <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
        <div className={`w-2 h-2 rounded-full ${severityDot(alert.severity)}`} />
      </div>

      {/* Icon */}
      <div className="shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-[#132337]/40" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#132337] truncate leading-tight">
          {displayTitle}
        </p>
        <p className="text-xs text-[#132337]/50 mt-0.5 line-clamp-2 leading-relaxed">
          {displaySub}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-[#132337]/40">
            {relativeTime(alert.trigger_date || alert.created_at || "")}
          </span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-normal">
            {alert.type.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      {/* Acknowledge on hover */}
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1 p-1 rounded hover:bg-[#e4e8ef]"
        title="Acknowledge"
        onClick={(e) => {
          e.stopPropagation();
          onAcknowledge(alert.id);
        }}
      >
        <CheckCheck className="w-3.5 h-3.5 text-[#132337]/40" />
      </button>
    </div>
  );
}

function NotificationGroup({
  title,
  alerts,
  onAcknowledge,
  onNavigate,
}: {
  title: string;
  alerts: Alert[];
  onAcknowledge: (id: string) => void;
  onNavigate: () => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#132337]/40 px-4 py-2">
        {title}
      </p>
      {alerts.map((alert) => (
        <NotificationItem
          key={alert.id}
          alert={alert}
          onAcknowledge={onAcknowledge}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

// ---------- Main Component ----------

export function NotificationCenter() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listAlerts({ page_size: 50 });
      setAlerts(data.items || []);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 60s
  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Refresh when popover opens
  useEffect(() => {
    if (open) fetchAlerts();
  }, [open, fetchAlerts]);

  const pendingAlerts = alerts.filter((a) => a.status === "pending");
  const unreadCount = pendingAlerts.length;
  const { today, thisWeek, earlier } = groupAlertsByPeriod(pendingAlerts);

  async function handleAcknowledge(alertId: string) {
    // Optimistic update
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId ? { ...a, status: "acknowledged" } : a
      )
    );
    try {
      await acknowledgeAlert(alertId);
    } catch {
      // Revert on failure
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId ? { ...a, status: "pending" } : a
        )
      );
    }
  }

  async function handleMarkAllRead() {
    if (pendingAlerts.length === 0) return;
    setMarkingAll(true);
    // Optimistic: mark all pending as acknowledged locally
    const pendingIds = pendingAlerts.map((a) => a.id);
    setAlerts((prev) =>
      prev.map((a) =>
        pendingIds.includes(a.id) ? { ...a, status: "acknowledged" } : a
      )
    );
    try {
      await Promise.allSettled(
        pendingIds.map((id) => acknowledgeAlert(id))
      );
    } catch {
      // Refresh to get accurate state
      await fetchAlerts();
    } finally {
      setMarkingAll(false);
    }
  }

  const BellIcon = unreadCount > 0 ? BellDot : Bell;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <BellIcon className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] h-[18px] leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e4e8ef]">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#132337]">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#132337]/50 hover:text-[#132337]"
              onClick={handleMarkAllRead}
              disabled={markingAll}
            >
              {markingAll ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <CheckCheck className="w-3 h-3 mr-1" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        {/* Body */}
        <ScrollArea className="max-h-[400px]">
          {loading && alerts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-[#132337]/40" />
            </div>
          ) : unreadCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Bell className="w-8 h-8 text-[#e4e8ef] mb-3" />
              <p className="text-sm font-medium text-[#132337]/50">
                All caught up!
              </p>
              <p className="text-xs text-[#132337]/40 mt-1">
                No pending notifications
              </p>
            </div>
          ) : (
            <>
              <NotificationGroup
                title="Today"
                alerts={today}
                onAcknowledge={handleAcknowledge}
                onNavigate={() => setOpen(false)}
              />
              <NotificationGroup
                title="This Week"
                alerts={thisWeek}
                onAcknowledge={handleAcknowledge}
                onNavigate={() => setOpen(false)}
              />
              <NotificationGroup
                title="Earlier"
                alerts={earlier}
                onAcknowledge={handleAcknowledge}
                onNavigate={() => setOpen(false)}
              />
            </>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#e4e8ef] bg-[#f4f6f9]/50">
          <Link href="/alerts" onClick={() => setOpen(false)}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-[#132337]/60 hover:text-[#132337]"
            >
              View all alerts
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
