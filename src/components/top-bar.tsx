"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Search, Menu, AlertTriangle, CalendarClock, IndianRupee, TrendingUp, ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { listAlerts, acknowledgeAlert } from "@/lib/api";

interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  trigger_date: string;
  outlet_id?: string;
  created_at?: string;
}

function getAlertIcon(type: string) {
  switch (type) {
    case "lease_expiry":
    case "lock_in_expiry":
      return CalendarClock;
    case "escalation":
      return TrendingUp;
    case "rent_due":
      return IndianRupee;
    case "risk_flag":
      return ShieldAlert;
    default:
      return AlertTriangle;
  }
}

function severityColor(severity: string) {
  switch (severity) {
    case "high": return "bg-red-500";
    case "medium": return "bg-amber-500";
    case "low": return "bg-blue-500";
    default: return "bg-neutral-400";
  }
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function groupAlerts(alerts: Alert[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const todayAlerts: Alert[] = [];
  const weekAlerts: Alert[] = [];
  const earlierAlerts: Alert[] = [];

  for (const a of alerts) {
    const d = new Date(a.trigger_date || a.created_at || "");
    if (d >= today) todayAlerts.push(a);
    else if (d >= weekAgo) weekAlerts.push(a);
    else earlierAlerts.push(a);
  }

  return { todayAlerts, weekAlerts, earlierAlerts };
}

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function fetchAlerts() {
    try {
      setLoading(true);
      const data = await listAlerts({ page_size: 50 });
      setAlerts(data.items || []);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) fetchAlerts();
  }, [open]);

  const pendingAlerts = alerts.filter((a) => a.status === "pending");
  const unreadCount = pendingAlerts.length;
  const { todayAlerts, weekAlerts, earlierAlerts } = groupAlerts(pendingAlerts);

  async function handleAcknowledge(alertId: string) {
    try {
      await acknowledgeAlert(alertId);
      setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, status: "acknowledged" } : a));
    } catch {
      // ignore
    }
  }

  function AlertItem({ alert }: { alert: Alert }) {
    const Icon = getAlertIcon(alert.type);
    return (
      <div className="py-3 border-b border-neutral-100 last:border-0 group">
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${severityColor(alert.severity)}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <p className="text-sm font-medium truncate">{alert.title}</p>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">{alert.message}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-neutral-400">
                {timeAgo(alert.trigger_date || alert.created_at || "")}
              </span>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                {alert.type.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => handleAcknowledge(alert.id)}
              >
                Acknowledge
              </Button>
              <Link href="/alerts">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                  View All
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function AlertSection({ title, items }: { title: string; items: Alert[] }) {
    if (items.length === 0) return null;
    return (
      <div className="px-4 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
          {title}
        </p>
        {items.map((alert) => (
          <AlertItem key={alert.id} alert={alert} />
        ))}
      </div>
    );
  }

  return (
    <header className="h-14 bg-white border-b border-neutral-100 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0 gap-3">
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9 shrink-0"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="relative w-full hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input
            placeholder="Search outlets, agreements, alerts..."
            className="pl-9 h-9 text-sm bg-neutral-50 border-neutral-200 focus:bg-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] h-[18px]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:w-[400px] p-0">
            <SheetHeader className="p-4 border-b">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-base font-semibold">Notifications</SheetTitle>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {unreadCount} pending
                  </Badge>
                )}
              </div>
            </SheetHeader>
            <div className="overflow-y-auto max-h-[calc(100vh-80px)]">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              ) : unreadCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <Bell className="w-8 h-8 text-neutral-300 mb-3" />
                  <p className="text-sm text-neutral-500 font-medium">All caught up!</p>
                  <p className="text-xs text-neutral-400 mt-1">No pending notifications</p>
                </div>
              ) : (
                <>
                  <AlertSection title="Today" items={todayAlerts} />
                  <AlertSection title="This Week" items={weekAlerts} />
                  <AlertSection title="Earlier" items={earlierAlerts} />
                </>
              )}
              {unreadCount > 0 && (
                <div className="p-4 border-t">
                  <Link href="/alerts">
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      View All Alerts
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
