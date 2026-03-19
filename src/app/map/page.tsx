"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDashboardStats } from "@/lib/api";
import { useUser } from "@/lib/hooks/use-user";
import dynamic from "next/dynamic";

const IndiaMap = dynamic(() => import("@/components/india-map"), { ssr: false });
import { Badge } from "@/components/ui/badge";
import {
  Store,
  FileCheck,
  IndianRupee,
  Bell,
  MapPin,
  Activity,
  CalendarClock,
  ShieldAlert,
  TrendingDown,
  Loader2,
  ChevronRight,
  Building2,
  Percent,
  BarChart3,
} from "lucide-react";

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
}

function formatINR(amount: number): string {
  const str = Math.round(amount).toString();
  if (str.length <= 3) return `\u20B9${str}`;
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  const withCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `\u20B9${withCommas},${last3}`;
}

function statusLabel(key: string): string {
  if (!key) return "Unknown";
  return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function statusColor(status: string): string {
  switch (status) {
    case "operational": return "#10b981";
    case "fit_out": return "#f59e0b";
    case "closed": return "#ef4444";
    case "under_construction": return "#3b82f6";
    case "up_for_renewal": return "#f59e0b";
    case "pipeline": return "#8b5cf6";
    default: return "#a3a3a3";
  }
}

export default function MapViewPage() {
  useUser();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapCluster, setMapCluster] = useState<{
    label: string;
    cities: string[];
    count: number;
    outlets: { name: string; status: string; rent?: number; id?: string }[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      try {
        setLoading(true);
        const data = await getDashboardStats();
        if (!cancelled) setStats(data);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchStats();
    return () => { cancelled = true; };
  }, []);

  const outletsByCity = stats
    ? Object.entries(stats.outlets_by_city)
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
    : [];

  const outletsByStatus = stats
    ? Object.entries(stats.outlets_by_status)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count)
    : [];

  const totalOutlets = stats?.total_outlets ?? 0;
  const totalCities = outletsByCity.length;
  const maxCityCount = outletsByCity.length ? Math.max(...outletsByCity.map((c) => c.count)) : 1;

  // Computed analytics
  const operationalCount = outletsByStatus.find(s => s.status === "operational")?.count ?? 0;
  const operationalPct = totalOutlets > 0 ? Math.round((operationalCount / totalOutlets) * 100) : 0;
  const avgRentPerOutlet = totalOutlets > 0 ? (stats?.total_monthly_rent ?? 0) / totalOutlets : 0;
  const topCity = outletsByCity[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#132337]/50" />
          <p className="text-sm font-medium text-neutral-500">Loading map data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden animate-fade-in">
      {/* ─── Always-Visible Left Panel ─── */}
      <div className="w-[340px] xl:w-[380px] shrink-0 border-r border-[#e4e8ef] bg-white overflow-y-auto">
        {/* Panel Header */}
        <div className="bg-white border-b border-[#e4e8ef] px-5 pt-4 pb-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[#132337] flex items-center justify-center">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-[#132337]">Map View</h1>
              <p className="text-[11px] text-neutral-400">
                {totalOutlets} outlets across {totalCities} {totalCities === 1 ? "city" : "cities"}
              </p>
            </div>
            <Badge
              variant="outline"
              className="ml-auto text-[10px] gap-1 text-emerald-700 border-emerald-200 bg-emerald-50"
            >
              <Activity className="h-3 w-3" />
              Live
            </Badge>
          </div>

          {/* Primary Stats — 2x2 grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-[#f4f6f9] border border-[#e4e8ef] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Store className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-[10px] text-neutral-500 font-medium">Total Outlets</span>
              </div>
              <p className="text-2xl font-bold text-[#132337] tabular-nums">{totalOutlets}</p>
            </div>
            <div className="rounded-xl bg-[#f4f6f9] border border-[#e4e8ef] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <FileCheck className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-[10px] text-neutral-500 font-medium">Agreements</span>
              </div>
              <p className="text-2xl font-bold text-[#132337] tabular-nums">{stats?.active_agreements ?? 0}</p>
              <p className="text-[9px] text-neutral-400">of {stats?.total_agreements ?? 0} total</p>
            </div>
            <div className="rounded-xl bg-[#f4f6f9] border border-[#e4e8ef] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <IndianRupee className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-[10px] text-neutral-500 font-medium">Monthly Rent</span>
              </div>
              <p className="text-lg font-bold text-[#132337] tabular-nums">{formatINR(stats?.total_monthly_rent ?? 0)}</p>
            </div>
            <div className="rounded-xl bg-[#f4f6f9] border border-[#e4e8ef] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Bell className={`h-3.5 w-3.5 ${(stats?.pending_alerts ?? 0) > 0 ? "text-amber-500" : "text-neutral-400"}`} />
                <span className="text-[10px] text-neutral-500 font-medium">Alerts</span>
              </div>
              <p className={`text-2xl font-bold tabular-nums ${(stats?.pending_alerts ?? 0) > 0 ? "text-amber-600" : "text-[#132337]"}`}>
                {stats?.pending_alerts ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* ── Quick Insights ── */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Quick Insights
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Percent className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-neutral-500 font-medium">Operational Rate</p>
                  <p className="text-lg font-bold text-emerald-700">{operationalPct}%</p>
                </div>
                <span className="text-[10px] text-emerald-600 font-medium">{operationalCount}/{totalOutlets}</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f4f6f9] border border-[#e4e8ef]">
                <div className="w-9 h-9 rounded-lg bg-[#132337]/10 flex items-center justify-center flex-shrink-0">
                  <IndianRupee className="h-4 w-4 text-[#132337]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-neutral-500 font-medium">Avg Rent / Outlet</p>
                  <p className="text-lg font-bold text-[#132337]">{formatINR(avgRentPerOutlet)}</p>
                </div>
              </div>
              {topCity && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f4f6f9] border border-[#e4e8ef]">
                  <div className="w-9 h-9 rounded-lg bg-[#132337]/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-4 w-4 text-[#132337]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-neutral-500 font-medium">Top City</p>
                    <p className="text-sm font-bold text-[#132337]">{topCity.city}</p>
                  </div>
                  <span className="text-xs font-bold text-[#132337] tabular-nums">{topCity.count} outlets</span>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f4f6f9] border border-[#e4e8ef]">
                <div className="w-9 h-9 rounded-lg bg-[#132337]/10 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="h-4 w-4 text-[#132337]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-neutral-500 font-medium">Total Outflow</p>
                  <p className="text-lg font-bold text-[#132337]">{formatINR(stats?.total_monthly_outflow ?? 0)}</p>
                </div>
                <span className="text-[9px] text-neutral-400 font-medium">per month</span>
              </div>
            </div>
          </div>

          {/* ── Risk Summary ── */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Risk & Alerts
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: CalendarClock, label: "Expiring 90d", value: stats?.expiring_leases_90d ?? 0, danger: (stats?.expiring_leases_90d ?? 0) > 0 },
                { icon: ShieldAlert, label: "Risk Flags", value: stats?.total_risk_flags ?? 0, danger: (stats?.total_risk_flags ?? 0) > 0 },
                { icon: TrendingDown, label: "Overdue", value: stats?.overdue_payments_count ?? 0, danger: (stats?.overdue_payments_count ?? 0) > 0 },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`rounded-xl p-2.5 text-center border ${
                    item.danger ? "bg-red-50/60 border-red-100" : "bg-[#f4f6f9] border-[#e4e8ef]"
                  }`}
                >
                  <item.icon className={`h-4 w-4 mx-auto mb-1 ${item.danger ? "text-red-500" : "text-neutral-400"}`} />
                  <p className={`text-xl font-bold tabular-nums ${item.danger ? "text-red-600" : "text-[#132337]"}`}>
                    {item.value}
                  </p>
                  <p className="text-[8px] text-neutral-400 font-semibold uppercase tracking-wider">{item.label}</p>
                </div>
              ))}
            </div>
            {(stats?.overdue_amount ?? 0) > 0 && (
              <div className="mt-2 p-2.5 rounded-xl bg-red-50/60 border border-red-100 flex items-center gap-2">
                <IndianRupee className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                <span className="text-[11px] text-red-600 font-medium">
                  {formatINR(stats?.overdue_amount ?? 0)} overdue amount
                </span>
              </div>
            )}
          </div>

          {/* ── Selected Cluster Detail ── */}
          {mapCluster && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  {mapCluster.label} — {mapCluster.count} outlets
                </h3>
                <button
                  onClick={() => setMapCluster(null)}
                  className="text-[10px] text-neutral-400 hover:text-neutral-600 font-medium"
                >
                  Clear
                </button>
              </div>
              {mapCluster.outlets.length > 0 ? (
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {mapCluster.outlets.map((outlet, i) => {
                    const sColor = statusColor(outlet.status);
                    return (
                      <Link
                        key={i}
                        href={outlet.id ? `/outlets/${outlet.id}` : "#"}
                        className="group flex items-center gap-2.5 py-2 px-3 rounded-xl bg-[#f4f6f9] hover:bg-[#edf0f4] transition-all"
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sColor }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium text-[#132337] truncate">{outlet.name}</p>
                          <p className="text-[9px] text-neutral-400 capitalize">{outlet.status?.replace(/_/g, " ")}</p>
                        </div>
                        {outlet.rent ? (
                          <span className="text-[10px] font-semibold text-neutral-500 tabular-nums flex-shrink-0">
                            {formatINR(outlet.rent)}
                          </span>
                        ) : null}
                        <ChevronRight className="h-3 w-3 text-neutral-300 group-hover:text-neutral-500 transition-colors flex-shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-neutral-400 px-3 py-2 rounded-xl bg-[#f4f6f9]">
                  {mapCluster.count} outlets in this area
                </p>
              )}
            </div>
          )}

          {/* ── Outlets by City ── */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              By City
            </h3>
            <div className="space-y-2.5">
              {outletsByCity.map(({ city, count }) => {
                const pct = (count / maxCityCount) * 100;
                return (
                  <div key={city}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] font-medium text-neutral-600">{city}</span>
                      <span className="text-[11px] font-bold text-[#132337] tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#132337]/6 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#132337] transition-all duration-700 ease-out"
                        style={{ width: `${pct}%`, opacity: 0.15 + (pct / 100) * 0.85 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Outlets by Status ── */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              By Status
            </h3>
            <div className="space-y-1.5">
              {outletsByStatus.map(({ status, count }) => {
                const total = outletsByStatus.reduce((s, c) => s + c.count, 0);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                const color = statusColor(status);
                return (
                  <div key={status} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#f4f6f9] hover:bg-[#edf0f4] transition-all">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
                    >
                      <span className="text-sm font-bold" style={{ color }}>{count}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-medium text-neutral-700">{statusLabel(status)}</span>
                        <span className="text-[9px] font-semibold text-neutral-400">{pct}%</span>
                      </div>
                      <div className="h-1 w-full rounded-full bg-[#132337]/6 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Rent Distribution by City ── */}
          {stats?.outlet_details_by_city && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Rent by City
              </h3>
              <div className="space-y-2">
                {outletsByCity.map(({ city }) => {
                  const cityOutlets = stats.outlet_details_by_city?.[city] || [];
                  const cityRent = cityOutlets.reduce((s, o) => s + (o.rent ?? 0), 0);
                  if (cityRent === 0) return null;
                  const totalRent = stats.total_monthly_rent || 1;
                  const pct = Math.round((cityRent / totalRent) * 100);
                  return (
                    <div key={city} className="flex items-center gap-2.5 p-2 rounded-lg bg-[#f4f6f9]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] font-medium text-neutral-600">{city}</span>
                          <span className="text-[11px] font-bold text-[#132337] tabular-nums">{formatINR(cityRent)}</span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-[#132337]/6 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#3b82f6] transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[8px] text-neutral-400 mt-0.5">{pct}% of total rent</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Map Area (fills remaining space, no scroll) ─── */}
      <div className="flex-1 relative bg-[#edf0f4] overflow-hidden h-full">
        {outletsByCity.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <MapPin className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-400 font-medium">No outlet location data yet</p>
              <p className="text-xs text-neutral-300 mt-1">Add outlets with city data to see them on the map</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full overflow-hidden">
            <IndiaMap
              outletsByCity={stats?.outlets_by_city || {}}
              outletDetails={stats?.outlet_details_by_city}
              selectedCluster={mapCluster?.label ?? null}
              onSelectCluster={setMapCluster}
            />
          </div>
        )}
      </div>
    </div>
  );
}
