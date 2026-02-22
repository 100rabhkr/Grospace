"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDashboardStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

/** Return Tailwind color classes for outlet status badges */
function statusBadgeClasses(status: string): string {
  switch (status) {
    case "operational":
      return "border-green-200 text-green-700 bg-green-50";
    case "fit_out":
      return "border-amber-200 text-amber-700 bg-amber-50";
    case "closed":
      return "border-red-200 text-red-700 bg-red-50";
    case "under_construction":
      return "border-blue-200 text-blue-700 bg-blue-50";
    default:
      return "border-neutral-200 text-neutral-600 bg-neutral-50";
  }
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
      <div className="grid grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Row 2 - 3 stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Row 3 - 2 cards */}
      <div className="grid grid-cols-2 gap-4">
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
            Upload your first lease agreement to start tracking outlets,
            obligations, and alerts across your portfolio.
          </p>
          <div className="flex gap-3">
            <Link href="/agreements/upload">
              <Button size="sm">
                <Upload className="h-4 w-4" />
                Upload Agreement
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
// Main Dashboard Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-6">
      {/* -------------------------------------------------------------- */}
      {/* Page heading                                                     */}
      {/* -------------------------------------------------------------- */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Platform overview across {stats?.total_outlets ?? 0} outlets and{" "}
          {stats?.total_agreements ?? 0} agreements
        </p>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 1 -- Primary stat cards (4 columns)                          */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-4 gap-4">
        {/* Total Outlets */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Total Outlets
            </CardTitle>
            <Store className="h-4 w-4 text-neutral-400" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">
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
            <FileCheck className="h-4 w-4 text-neutral-400" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">
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
            <IndianRupee className="h-4 w-4 text-neutral-400" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">
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
            <div className={`text-2xl font-bold ${(stats?.pending_alerts ?? 0) > 0 ? "text-amber-600" : ""}`}>
              {stats?.pending_alerts ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Require attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 2 -- Secondary stat cards (3 columns)                        */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-3 gap-4">
        {/* Expiring Leases (90 days) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Expiring Leases (90d)
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-neutral-400" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={`text-2xl font-bold ${(stats?.expiring_leases_90d ?? 0) > 0 ? "text-red-600" : ""}`}>
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
            <div className={`text-2xl font-bold ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-600" : ""}`}>
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
            <TrendingDown className="h-4 w-4 text-neutral-400" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">
              {formatINR(stats?.total_monthly_outflow ?? 0)}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Rent + CAM + all charges
            </p>
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 3 -- Outlets by City + Outlets by Status                     */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4">
        {/* Outlets by City -- horizontal bar chart */}
        <Card className="flex flex-col">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">
              Outlets by City
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 flex-1">
            {outletsByCity.length === 0 ? (
              <p className="text-xs text-neutral-400">No outlet data yet.</p>
            ) : (
              <div className="space-y-3">
                {outletsByCity.map(({ city, count }) => (
                  <div key={city}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-neutral-700">{city}</span>
                      <span className="text-sm font-semibold">{count}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
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

        {/* Outlets by Status -- card grid with badges */}
        <Card className="flex flex-col">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">
              Outlets by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 flex-1">
            {outletsByStatus.length === 0 ? (
              <p className="text-xs text-neutral-400">No outlet data yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {outletsByStatus.map(({ status, count }) => (
                  <div
                    key={status}
                    className="rounded-lg border border-neutral-100 p-3 flex items-center justify-between"
                  >
                    <Badge
                      variant="outline"
                      className={`text-[11px] ${statusBadgeClasses(status)}`}
                    >
                      {statusLabel(status)}
                    </Badge>
                    <span className="text-lg font-bold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 4 -- Quick Actions                                           */}
      {/* -------------------------------------------------------------- */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="flex gap-3">
            <Link href="/agreements/upload">
              <Button size="sm">
                <Upload className="h-4 w-4" />
                Upload Agreement
              </Button>
            </Link>
            <Link href="/alerts">
              <Button variant="outline" size="sm">
                <Bell className="h-4 w-4" />
                View Alerts
              </Button>
            </Link>
            <Link href="/reports">
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4" />
                View Reports
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
