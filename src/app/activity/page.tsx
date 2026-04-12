"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useUser } from "@/lib/hooks/use-user";
import { getPlatformActivity, listOrganizations } from "@/lib/api";
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
  Activity,
  Building2,
  Loader2,
  Shield,
  ExternalLink,
  RefreshCw,
  Search,
} from "lucide-react";

interface ActivityItem {
  id: string;
  org_id: string | null;
  org_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
  actor: string;
}

interface OrgOption {
  id: string;
  name: string;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function actionLabel(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionColor(action: string): string {
  if (action.includes("delete")) return "bg-rose-50 text-rose-700 border-rose-200";
  if (action.includes("create") || action.includes("upload") || action.includes("activate")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (action.includes("invite") || action.includes("assign")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (action.includes("update") || action.includes("change")) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-muted text-foreground border-border";
}

export default function PlatformActivityPage() {
  const { user, loading: userLoading } = useUser();
  const isSuperAdmin = user?.role === "platform_admin";

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  async function fetchActivity(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params: { org_id?: string; limit: number } = { limit: 200 };
      if (orgFilter !== "all") params.org_id = orgFilter;
      const data = await getPlatformActivity(params);
      setItems(data.items || []);
    } catch (err) {
      console.error("Failed to load activity:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!userLoading && isSuperAdmin) {
      fetchActivity();
      // Fetch org list for the filter dropdown
      listOrganizations()
        .then((data) => setOrgs(data.items || data.organizations || []))
        .catch(() => {});
    } else if (!userLoading) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, isSuperAdmin]);

  // Re-fetch when org filter changes
  useEffect(() => {
    if (!userLoading && isSuperAdmin && !loading) {
      fetchActivity();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgFilter]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (i) =>
        i.action.toLowerCase().includes(q) ||
        i.org_name.toLowerCase().includes(q) ||
        i.actor.toLowerCase().includes(q) ||
        i.entity_type.toLowerCase().includes(q) ||
        JSON.stringify(i.details).toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  if (!userLoading && !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <Shield className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Platform admin only.</p>
        <Link href="/">
          <Button variant="outline" size="sm">Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Platform Activity
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-1">
            Real-time audit trail across every customer organization.
            {items.length > 0 && ` Showing ${filtered.length} event${filtered.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => fetchActivity(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <a
            href={process.env.NEXT_PUBLIC_ACTIVITY_SHEET_URL || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={!process.env.NEXT_PUBLIC_ACTIVITY_SHEET_URL ? "pointer-events-none opacity-50" : ""}
          >
            <Button size="sm" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Open Google Sheet
            </Button>
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All organizations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organizations</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by action, org, actor, entity…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading activity…</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-base font-semibold mb-1">No activity yet</h3>
            <p className="text-sm text-muted-foreground">
              {orgFilter !== "all"
                ? "No events recorded for this organization yet."
                : "Activity events will appear here as users interact with the platform."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="divide-y divide-border">
            {filtered.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="h-8 w-8 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0 mt-0.5 font-semibold text-[11px]">
                  {item.org_name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-foreground truncate">{item.actor}</span>
                    <Badge variant="outline" className={`text-[10px] ${actionColor(item.action)}`}>
                      {actionLabel(item.action)}
                    </Badge>
                    {item.entity_type && (
                      <span className="text-[11px] text-muted-foreground">
                        on {item.entity_type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Link href={item.org_id ? `/organizations/${item.org_id}` : "#"} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {item.org_name}
                    </Link>
                    <span className="text-[10px] text-muted-foreground/60">{formatTimeAgo(item.created_at)}</span>
                  </div>
                  {/* Show notable details */}
                  {item.details && Object.keys(item.details).length > 0 && (
                    <div className="mt-1 text-[10.5px] text-muted-foreground/80 truncate max-w-[600px]">
                      {Object.entries(item.details)
                        .filter(([k]) => !["id", "org_id", "user_id"].includes(k))
                        .slice(0, 4)
                        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                        .join(" · ")}
                    </div>
                  )}
                </div>
                <span className="text-[10.5px] text-muted-foreground shrink-0 mt-1">
                  {new Date(item.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
