"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { getDashboardStats, smartChat, listOutlets } from "@/lib/api";
import { useUser } from "@/lib/hooks/use-user";
import dynamic from "next/dynamic";

const IndiaMap = dynamic(() => import("@/components/india-map"), { ssr: false });
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Store,
  FileCheck,
  IndianRupee,
  Bell,
  CalendarClock,
  ShieldAlert,
  TrendingDown,
  Upload,
  AlertTriangle,
  BarChart3,
  Rocket,
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  User,
  MapPin,
  Shield,
  Users,
  Activity,
  Settings,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  total_outlets: number;
  total_agreements: number;
  active_agreements: number;
  total_monthly_rent: number;
  total_monthly_outflow: number;
  total_risk_flags: number;
  pending_alerts: number;
  expiring_leases_90d: number;
  outlets_by_city: Record<string, number>;
  outlets_by_status: Record<string, number>;
  outlet_details_by_city?: Record<string, { id?: string; name: string; status: string; rent?: number }[]>;
  overdue_payments_count?: number;
  overdue_amount?: number;
  pipeline_stages?: Record<string, number>;
  outlets_by_property_type?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a number as Indian currency: ₹1,06,920 */
function formatINR(amount: number): string {
  // Indian numbering: last 3 digits grouped, then every 2 digits
  const str = Math.round(amount).toString();
  if (str.length <= 3) return `₹${str}`;
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  const withCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${withCommas},${last3}`;
}

/** Pretty-print a status key like "fit_out" -> "Fit Out" */
function statusLabel(key: string): string {
  if (!key) return "Unknown";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Return hex color for outlet status (for pie chart) */
function statusColor(status: string): string {
  switch (status) {
    case "operational": return "#10b981";
    case "fit_out": return "#f59e0b";
    case "closed": return "#ef4444";
    case "under_construction": return "#3b82f6";
    default: return "#a3a3a3";
  }
}

/** Return hex color for property type (for bar chart) */
function propertyTypeColor(type: string): string {
  switch (type) {
    case "mall": return "#8b5cf6";
    case "high_street": return "#3b82f6";
    case "standalone": return "#10b981";
    case "food_court": return "#f59e0b";
    case "cloud_kitchen": return "#ef4444";
    case "institutional": return "#06b6d4";
    default: return "#a3a3a3";
  }
}

/** Simple SVG donut chart */
function DonutChart({ data, size = 140 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {data.map((d, i) => {
        const pct = d.value / total;
        const offset = circumference * (1 - accumulated);
        accumulated += pct;
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={d.color}
            strokeWidth={20}
            strokeDasharray={`${circumference * pct} ${circumference * (1 - pct)}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-all duration-500"
          />
        );
      })}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="text-2xl font-bold" fill="#171717">
        {total}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-200/60 ${className ?? ""}`}
    />
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <SkeletonBlock className="h-7 w-16 mb-1.5" />
        <SkeletonBlock className="h-2.5 w-28" />
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <SkeletonBlock className="h-5 w-28 mb-1.5" />
        <SkeletonBlock className="h-3 w-52" />
      </div>

      {/* Row 1 - 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Row 2 - 3 stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Row 3 - 2 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
        <Card>
          <CardHeader className="p-4 pb-2">
            <SkeletonBlock className="h-4 w-28" />
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <SkeletonBlock className="h-6 w-full" />
            <SkeletonBlock className="h-6 w-full" />
            <SkeletonBlock className="h-6 w-3/4" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <SkeletonBlock className="h-4 w-32" />
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Welcome to GroSpace
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
            <Rocket className="h-6 w-6 text-neutral-400" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Get Started with GroSpace</h2>
          <p className="text-sm text-neutral-500 max-w-md mb-6">
            Upload your first document to start tracking outlets,
            obligations, and alerts across your portfolio.
          </p>
          <div className="flex gap-3">
            <Link href="/agreements/upload">
              <Button size="sm">
                <Upload className="h-4 w-4" />
                Upload Documents
              </Button>
            </Link>
            <Link href="/outlets">
              <Button variant="outline" size="sm">
                <Store className="h-4 w-4" />
                View Outlets
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Chat Message Type
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

// ---------------------------------------------------------------------------
// GrowBot AI Chat Component
// ---------------------------------------------------------------------------

function SmartAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const data = await smartChat(question);
      setMessages((prev) => [...prev, { role: "ai", content: data.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: `Sorry, I couldn't process that. ${err instanceof Error ? err.message : "Please try again."}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "Where am I struggling with escalation?",
    "Which outlets have the highest risk?",
    "Show me overdue payments summary",
    "What leases expire in the next 90 days?",
  ];

  return (
    <Card>
      <CardHeader
        className="p-4 pb-2 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-neutral-600" />
            <CardTitle className="text-sm font-semibold">GrowBot AI</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {isOpen ? "Collapse" : "Expand"}
          </Badge>
        </div>
        <p className="text-xs text-neutral-400 mt-0.5">
          Ask anything about your portfolio — escalation, risk, payments, expiry
        </p>
      </CardHeader>

      {isOpen && (
        <CardContent className="p-4 pt-2">
          {/* Chat Messages */}
          <div className="border border-neutral-200 rounded-lg bg-neutral-50/50 h-[300px] overflow-y-auto p-3 mb-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <MessageSquare className="h-8 w-8 text-neutral-300" />
                <div>
                  <p className="text-sm text-neutral-500 font-medium">Ask your portfolio a question</p>
                  <p className="text-xs text-neutral-400 mt-1">Try one of the suggestions below</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "ai" && (
                  <div className="w-6 h-6 rounded-full bg-[#132337] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-[#132337] text-white"
                      : "bg-white border border-neutral-200 text-neutral-700"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3 h-3 text-neutral-600" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-[#132337] flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="bg-white border border-neutral-200 rounded-lg px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestions */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                  }}
                  className="text-xs bg-white border border-neutral-200 rounded-full px-3 py-1.5 text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Ask about your portfolio..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="flex-1 text-sm"
              disabled={loading}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="px-3"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { user } = useUser();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapCluster, setMapCluster] = useState<{
    label: string;
    cities: string[];
    count: number;
    outlets: { name: string; status: string; rent?: number }[];
  } | null>(null);
  const [propertyTypeCounts, setPropertyTypeCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        setLoading(true);
        setError(null);
        const data = await getDashboardStats();
        if (!cancelled) {
          setStats(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load dashboard"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch outlets to compute property type breakdown
  useEffect(() => {
    let cancelled = false;

    async function fetchPropertyTypes() {
      try {
        // If stats already has property type data, use it
        if (stats?.outlets_by_property_type && Object.keys(stats.outlets_by_property_type).length > 0) {
          if (!cancelled) setPropertyTypeCounts(stats.outlets_by_property_type);
          return;
        }
        // Otherwise fetch outlets and compute
        const data = await listOutlets({ page: 1, page_size: 500 });
        if (!cancelled && data?.items) {
          const counts: Record<string, number> = {};
          for (const outlet of data.items) {
            const pt = (outlet as { property_type?: string }).property_type || "unknown";
            counts[pt] = (counts[pt] || 0) + 1;
          }
          setPropertyTypeCounts(counts);
        }
      } catch {
        // Non-critical — silently ignore
      }
    }

    if (stats) fetchPropertyTypes();
    return () => { cancelled = true; };
  }, [stats]);

  // Role-based visibility helpers
  // TODO: If role-scoped backend endpoints are added, filter data server-side as well
  const isPlatformAdmin = user?.role === "platform_admin" || user?.role === "org_admin";
  const isOrgMember = user?.role === "org_member";

  // Role tier badge config (Task 42)
  const roleTierConfig: Record<string, { badge: string; color: string; icon: JSX.Element }> = {
    platform_admin: {
      badge: "System Admin",
      color: "bg-red-100 text-red-800 border-red-200",
      icon: <Shield className="h-3 w-3" />,
    },
    org_admin: {
      badge: "Admin",
      color: "bg-blue-100 text-blue-800 border-blue-200",
      icon: <Users className="h-3 w-3" />,
    },
    org_member: {
      badge: "Member",
      color: "bg-neutral-100 text-neutral-700 border-neutral-200",
      icon: <User className="h-3 w-3" />,
    },
  };
  const currentTier = roleTierConfig[user?.role || "org_member"];

  // Loading state
  if (loading) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <Card className="border-red-200">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mb-3" />
            <p className="text-sm font-medium text-red-700 mb-1">
              Failed to load dashboard
            </p>
            <p className="text-xs text-neutral-500 mb-4">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state -- no outlets or agreements yet
  if (
    stats &&
    stats.total_outlets === 0 &&
    stats.total_agreements === 0
  ) {
    return <EmptyState />;
  }

  // Derive chart data
  const outletsByCity = stats
    ? Object.entries(stats.outlets_by_city)
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
    : [];

  const outletsByStatus = stats
    ? Object.entries(stats.outlets_by_status).map(([status, count]) => ({
        status,
        count,
      }))
    : [];

  const maxCityCount = outletsByCity.length
    ? Math.max(...outletsByCity.map((c) => c.count))
    : 1;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* -------------------------------------------------------------- */}
      {/* Page heading                                                     */}
      {/* -------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <Badge className={`text-[10px] gap-1 px-2 py-0.5 border ${currentTier.color}`}>
              {currentTier.icon}
              {currentTier.badge}
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            {user?.role === "platform_admin"
              ? `System-wide overview across ${stats?.total_outlets ?? 0} outlets and ${stats?.total_agreements ?? 0} agreements`
              : isPlatformAdmin
                ? `Organization overview — ${stats?.total_outlets ?? 0} outlets, ${stats?.total_agreements ?? 0} agreements`
                : `Your portfolio — ${stats?.total_outlets ?? 0} outlets, ${stats?.pending_alerts ?? 0} pending alerts`}
          </p>
        </div>
        {user?.role === "platform_admin" && (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="gap-1 text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50">
              <Activity className="h-3 w-3" />
              System Healthy
            </Badge>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Quick Actions Row (top)                                          */}
      {/* -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Common actions for all roles */}
        <Link href="/ai-assistant">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            GrowBot AI
          </Button>
        </Link>
        <Link href="/agreements/upload">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Upload Documents
          </Button>
        </Link>
        <Link href="/outlets">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Store className="h-3.5 w-3.5" />
            View All Outlets
          </Button>
        </Link>
        <Link href="/reports">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" />
            View Reports
          </Button>
        </Link>

        {/* platform_admin: all-org switcher & system settings */}
        {user?.role === "platform_admin" && (
          <>
            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Settings className="h-3.5 w-3.5" />
                System Settings
              </Button>
            </Link>
          </>
        )}

        {/* org_admin: team management shortcuts */}
        {user?.role === "org_admin" && (
          <Link href="/settings">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Manage Team
            </Button>
          </Link>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 1 -- Primary stat cards (4 columns)                          */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        {/* Total Outlets */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Total Outlets
            </CardTitle>
            <Store className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">
              {stats?.total_outlets ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Across all locations
            </p>
          </CardContent>
        </Card>

        {/* Active Agreements */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Active Agreements
            </CardTitle>
            <FileCheck className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">
              {stats?.active_agreements ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              of {stats?.total_agreements ?? 0} total
            </p>
          </CardContent>
        </Card>

        {/* Monthly Rent Exposure */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Monthly Rent Exposure
            </CardTitle>
            <IndianRupee className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">
              {formatINR(stats?.total_monthly_rent ?? 0)}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Total monthly rent
            </p>
          </CardContent>
        </Card>

        {/* Pending Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Pending Alerts
            </CardTitle>
            <Bell className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={`text-2xl font-semibold ${(stats?.pending_alerts ?? 0) > 0 ? "text-amber-600" : ""}`}>
              {stats?.pending_alerts ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Require attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 2 -- Secondary stat cards (3 columns) [admin/org_admin only] */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5">
        {/* Expiring Leases (90 days) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Expiring Leases (90d)
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={`text-2xl font-semibold ${(stats?.expiring_leases_90d ?? 0) > 0 ? "text-red-600" : ""}`}>
              {stats?.expiring_leases_90d ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Within the next 90 days
            </p>
          </CardContent>
        </Card>

        {/* Total Risk Flags */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Total Risk Flags
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={`text-2xl font-semibold ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-600" : ""}`}>
              {stats?.total_risk_flags ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Across all agreements
            </p>
          </CardContent>
        </Card>

        {/* Total Monthly Outflow */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Total Monthly Outflow
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">
              {formatINR(stats?.total_monthly_outflow ?? 0)}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Rent + CAM + all charges
            </p>
          </CardContent>
        </Card>
      </div>}

      {/* -------------------------------------------------------------- */}
      {/* Row 2.5 -- Expiring Leases + Risk Flags + Overdue inline badges  */}
      {/* -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Overdue payments badge */}
        {(stats?.overdue_payments_count ?? 0) > 0 && (
          <Link href="/payments">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50/80 hover:bg-red-50 transition-colors cursor-pointer">
              <IndianRupee className="h-4 w-4 text-red-600 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-red-700">
                  {stats?.overdue_payments_count ?? 0}
                </span>
                <span className="text-xs text-red-600">
                  overdue ({formatINR(stats?.overdue_amount ?? 0)})
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Expiring Leases mini-widget */}
        {(stats?.expiring_leases_90d ?? 0) > 0 && (
          <Link href="/alerts">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/80 hover:bg-amber-50 transition-colors cursor-pointer">
              <CalendarClock className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-amber-700">
                  {stats?.expiring_leases_90d ?? 0}
                </span>
                <span className="text-xs text-amber-600">
                  lease{(stats?.expiring_leases_90d ?? 0) !== 1 ? "s" : ""} expiring in 90 days
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Risk Flags summary badge */}
        {(stats?.total_risk_flags ?? 0) > 0 && (
          <Link href="/agreements">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50/80 hover:bg-red-50 transition-colors cursor-pointer">
              <ShieldAlert className="h-4 w-4 text-red-500 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-red-700">
                  {stats?.total_risk_flags ?? 0}
                </span>
                <span className="text-xs text-red-600">
                  risk flag{(stats?.total_risk_flags ?? 0) !== 1 ? "s" : ""} across agreements
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Pending alerts badge */}
        {(stats?.pending_alerts ?? 0) > 0 && (
          <Link href="/alerts">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition-colors cursor-pointer">
              <Bell className="h-4 w-4 text-neutral-500 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-neutral-700">
                  {stats?.pending_alerts ?? 0}
                </span>
                <span className="text-xs text-neutral-500">
                  pending alert{(stats?.pending_alerts ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 2.7 -- Pipeline Summary [admin only]                         */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && stats?.pipeline_stages && Object.keys(stats.pipeline_stages).length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Deal Pipeline</CardTitle>
              <Link href="/pipeline">
                <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-neutral-100">
                  View Pipeline
                </Badge>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="flex gap-2 overflow-x-auto">
              {["lead", "site_visit", "negotiation", "loi_sent", "agreement_signed", "fit_out", "operational"].map((stage) => {
                const count = stats.pipeline_stages?.[stage] ?? 0;
                if (count === 0) return null;
                return (
                  <div key={stage} className="flex flex-col items-center min-w-[80px] rounded-lg border border-neutral-100 p-2.5">
                    <span className="text-lg font-bold">{count}</span>
                    <span className="text-[10px] text-neutral-500 text-center">{statusLabel(stage)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Row 2.8 -- Expiring Leases + Risk Flags + Property Type cards    */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {/* Expiring Leases Card */}
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-amber-700">
                Expiring Leases
              </CardTitle>
              <CalendarClock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-bold text-amber-700">
                {stats?.expiring_leases_90d ?? 0}
              </div>
              <p className="text-xs text-amber-600/80 mt-1">
                Agreements expiring within 90 days
              </p>
              {(stats?.expiring_leases_90d ?? 0) > 0 && (
                <Link href="/alerts" className="inline-block mt-2">
                  <Button variant="outline" size="sm" className="text-[11px] h-7 border-amber-300 text-amber-700 hover:bg-amber-100">
                    Review Expiring
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Risk Flags Summary Card */}
          <Card className={`${(stats?.total_risk_flags ?? 0) > 0 ? "border-red-200 bg-red-50/30" : "border-emerald-200 bg-emerald-50/30"}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className={`text-xs font-medium ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-700" : "text-emerald-700"}`}>
                Risk Flags Summary
              </CardTitle>
              <ShieldAlert className={`h-4 w-4 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-500" : "text-emerald-500"}`} />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className={`text-3xl font-bold ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-700" : "text-emerald-700"}`}>
                {stats?.total_risk_flags ?? 0}
              </div>
              <p className={`text-xs mt-1 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-600/80" : "text-emerald-600/80"}`}>
                {(stats?.total_risk_flags ?? 0) > 0
                  ? "Total risk flags across all agreements"
                  : "No risk flags — portfolio looks healthy"}
              </p>
              {(stats?.total_risk_flags ?? 0) > 0 && (
                <Link href="/agreements" className="inline-block mt-2">
                  <Button variant="outline" size="sm" className="text-[11px] h-7 border-red-300 text-red-700 hover:bg-red-100">
                    View Flagged
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Outlets by Property Type Card */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">Outlets by Property Type</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {Object.keys(propertyTypeCounts).length === 0 ? (
                <p className="text-xs text-neutral-400">No property type data yet.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(propertyTypeCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => {
                      const maxCount = Math.max(...Object.values(propertyTypeCounts));
                      return (
                        <div key={type}>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: propertyTypeColor(type) }}
                              />
                              <span className="text-xs text-neutral-700">{statusLabel(type)}</span>
                            </div>
                            <span className="text-xs font-semibold tabular-nums">{count}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${(count / maxCount) * 100}%`,
                                backgroundColor: propertyTypeColor(type),
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Row 3 -- India Map + Outlets by City & Status [admin only]        */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-5">
        {/* India Map -- 3 columns */}
        <Card className="flex flex-col lg:col-span-3 overflow-hidden border-neutral-200/60">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-950 flex items-center justify-center">
                <MapPin className="h-3 w-3 text-white" />
              </div>
              <CardTitle className="text-sm font-semibold">
                Outlet Locations
              </CardTitle>
              <Badge variant="secondary" className="text-[10px] ml-auto font-semibold">
                {stats?.total_outlets ?? 0} outlets
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {outletsByCity.length === 0 ? (
              <p className="text-xs text-neutral-400">No outlet data yet.</p>
            ) : (
              <IndiaMap
                outletsByCity={stats?.outlets_by_city || {}}
                outletDetails={stats?.outlet_details_by_city}
                selectedCluster={mapCluster?.label ?? null}
                onSelectCluster={setMapCluster}
              />
            )}
          </CardContent>
        </Card>

        {/* Right side -- City list (or selected cluster outlets) + Status */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-5">
          {/* Outlets by City / Selected cluster detail */}
          <Card className="flex flex-col">
            <CardHeader className="p-4 pb-2">
              {mapCluster ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#132337] flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-3 w-3 text-white" />
                  </div>
                  <CardTitle className="text-sm font-semibold truncate">
                    {mapCluster.label}
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px] ml-auto font-semibold">
                    {mapCluster.count}
                  </Badge>
                  <button
                    onClick={() => setMapCluster(null)}
                    className="ml-1 text-neutral-400 hover:text-neutral-700 transition-colors"
                  >
                    <span className="text-xs">&times;</span>
                  </button>
                </div>
              ) : (
                <CardTitle className="text-sm font-semibold">
                  Outlets by City
                </CardTitle>
              )}
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {mapCluster ? (
                <>
                  {mapCluster.cities.length > 1 && (
                    <p className="text-[10px] text-neutral-400 mb-3">
                      {mapCluster.cities.join(" / ")}
                    </p>
                  )}
                  {mapCluster.outlets.length > 0 ? (
                    <div className="space-y-0.5 max-h-[320px] overflow-y-auto pr-1">
                      {mapCluster.outlets.map((outlet, i) => (
                        <div
                          key={i}
                          className="group flex items-center gap-2.5 py-2 px-2.5 rounded-lg border border-transparent hover:border-neutral-100 hover:bg-neutral-50 hover:shadow-sm transition-all duration-150 cursor-default"
                        >
                          <div
                            className="w-1 h-6 rounded-full flex-shrink-0 transition-colors"
                            style={{
                              backgroundColor:
                                outlet.status === "operational" ? "#10b981" :
                                outlet.status === "closed" ? "#ef4444" :
                                outlet.status === "up_for_renewal" ? "#f59e0b" : "#d4d4d4",
                            }}
                          />
                          <Store className="h-3.5 w-3.5 text-neutral-300 group-hover:text-neutral-500 flex-shrink-0 transition-colors" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-neutral-700 group-hover:text-neutral-900 truncate transition-colors font-medium">
                              {outlet.name}
                            </p>
                            <p className="text-[10px] text-neutral-400 capitalize">
                              {outlet.status === "up_for_renewal" ? "Renewal" : outlet.status}
                            </p>
                          </div>
                          {outlet.rent ? (
                            <span className="text-[11px] text-neutral-500 group-hover:text-neutral-700 tabular-nums flex-shrink-0 font-medium transition-colors">
                              {`\u20B9${Math.round(outlet.rent).toLocaleString("en-IN")}`}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400">
                      {mapCluster.count} outlet{mapCluster.count > 1 ? "s" : ""} in this area
                    </p>
                  )}
                </>
              ) : outletsByCity.length === 0 ? (
                <p className="text-xs text-neutral-400">No outlet data yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {outletsByCity.map(({ city, count }) => (
                    <div key={city}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-neutral-700">{city}</span>
                        <span className="text-xs font-semibold">{count}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-neutral-800 transition-all"
                          style={{
                            width: `${(count / maxCityCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Outlets by Status -- Donut Chart */}
          <Card className="flex flex-col">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">
                Outlets by Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {outletsByStatus.length === 0 ? (
                <p className="text-xs text-neutral-400">No outlet data yet.</p>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <DonutChart
                    data={outletsByStatus.map(({ status, count }) => ({
                      label: statusLabel(status),
                      value: count,
                      color: statusColor(status),
                    }))}
                  />
                  <div className="w-full space-y-1.5">
                    {outletsByStatus.map(({ status, count }) => (
                      <div key={status} className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: statusColor(status) }}
                        />
                        <span className="text-xs text-neutral-600 flex-1">
                          {statusLabel(status)}
                        </span>
                        <span className="text-xs font-semibold tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>}

      {/* -------------------------------------------------------------- */}
      {/* Org Member Simplified View                                       */}
      {/* -------------------------------------------------------------- */}
      {isOrgMember && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-5">
          {/* Expiring Leases Card (org_member view) */}
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-amber-700">
                Expiring Leases
              </CardTitle>
              <CalendarClock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-bold text-amber-700">
                {stats?.expiring_leases_90d ?? 0}
              </div>
              <p className="text-xs text-amber-600/80 mt-1">
                Agreements expiring within 90 days
              </p>
            </CardContent>
          </Card>

          {/* Risk Flags (org_member view) */}
          <Card className={`${(stats?.total_risk_flags ?? 0) > 0 ? "border-red-200 bg-red-50/30" : "border-emerald-200 bg-emerald-50/30"}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className={`text-xs font-medium ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-700" : "text-emerald-700"}`}>
                Risk Flags
              </CardTitle>
              <ShieldAlert className={`h-4 w-4 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-500" : "text-emerald-500"}`} />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className={`text-3xl font-bold ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-700" : "text-emerald-700"}`}>
                {stats?.total_risk_flags ?? 0}
              </div>
              <p className={`text-xs mt-1 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-600/80" : "text-emerald-600/80"}`}>
                {(stats?.total_risk_flags ?? 0) > 0
                  ? "Flags needing your attention"
                  : "All clear — no risk flags"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Row 5 -- GrowBot AI Chat                                        */}
      {/* -------------------------------------------------------------- */}
      <SmartAIChat />
    </div>
  );
}
