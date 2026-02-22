"use client";

import {
  getDashboardStats,
  outlets,
  agreements,
  alerts,
  paymentRecords,
  organizations,
  formatCurrency,
  formatDate,
  daysUntil,
  statusColor,
  statusLabel,
} from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Store,
  FileCheck,
  IndianRupee,
  AlertTriangle,
  ShieldAlert,
  CalendarClock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// ---------------------------------------------------------------------------
// Data derivations
// ---------------------------------------------------------------------------

const stats = getDashboardStats();

// Outlets grouped by city for the bar chart
const cityCountMap: Record<string, number> = {};
outlets.forEach((o) => {
  cityCountMap[o.city] = (cityCountMap[o.city] || 0) + 1;
});
const outletsByCity = Object.entries(cityCountMap)
  .map(([city, count]) => ({ city, count }))
  .sort((a, b) => b.count - a.count);

// Outlets grouped by status for the pie chart
const statusCountMap: Record<string, number> = {};
outlets.forEach((o) => {
  const label = statusLabel(o.status);
  statusCountMap[label] = (statusCountMap[label] || 0) + 1;
});
const outletsByStatus = Object.entries(statusCountMap).map(
  ([name, value]) => ({ name, value })
);
const PIE_COLORS = ["#171717", "#525252", "#a3a3a3", "#d4d4d4", "#e5e5e5", "#f5f5f5"];

// Alerts sorted by triggerDate (soonest first), limited to 6
const sortedAlerts = [...alerts]
  .sort(
    (a, b) =>
      new Date(a.triggerDate).getTime() - new Date(b.triggerDate).getTime()
  )
  .slice(0, 6);

// Expiring leases: status "expiring" OR expiry within 90 days
const expiringLeases = agreements.filter((a) => {
  if (a.status === "expiring") return true;
  if (!a.leaseExpiryDate) return false;
  const remaining = daysUntil(a.leaseExpiryDate);
  return remaining >= 0 && remaining <= 90;
});

// Risk flags aggregated
const allRiskFlags = agreements.flatMap((a) => a.riskFlags);
const highFlags = allRiskFlags.filter((f) => f.severity === "high");
const mediumFlags = allRiskFlags.filter((f) => f.severity === "medium");

// Overdue payments
const overduePayments = paymentRecords.filter((p) => p.status === "overdue");

// Severity dot colors
function severityDotColor(severity: string): string {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Platform overview across {organizations.length} brands and{" "}
          {stats.totalOutlets} outlets
        </p>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Row 1 -- Stat cards                                                */}
      {/* ----------------------------------------------------------------- */}
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
            <div className="text-2xl font-bold">{stats.totalOutlets}</div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Across {stats.totalBrands} brands
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
            <div className="text-2xl font-bold">{stats.activeAgreements}</div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Active + expiring
            </p>
          </CardContent>
        </Card>

        {/* Monthly Exposure */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Monthly Exposure
            </CardTitle>
            <IndianRupee className="h-4 w-4 text-neutral-400" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">
              {formatCurrency(stats.monthlyExposure)}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Total monthly outflow
            </p>
          </CardContent>
        </Card>

        {/* Overdue Amount */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Overdue Amount
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.overdueAmount)}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              {stats.overdueCount} payment{stats.overdueCount !== 1 ? "s" : ""}{" "}
              overdue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Row 2 -- Alerts & Expiring Leases                                  */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4">
        {/* Upcoming Alerts */}
        <Card className="flex flex-col">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">
              Upcoming Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 flex-1 overflow-y-auto max-h-[320px]">
            <div className="space-y-3">
              {sortedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 border-b border-neutral-100 pb-3 last:border-0 last:pb-0"
                >
                  <div className="mt-1.5 shrink-0">
                    <span
                      className={`block w-2 h-2 rounded-full ${severityDotColor(
                        alert.severity
                      )}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {alert.title}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {alert.outletName}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">
                      {alert.message}
                    </p>
                  </div>
                  <span className="text-[11px] text-neutral-400 shrink-0 whitespace-nowrap">
                    {formatDate(alert.triggerDate)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Expiring Leases */}
        <Card className="flex flex-col">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">
              Expiring Leases
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 flex-1 overflow-y-auto max-h-[320px]">
            {expiringLeases.length === 0 ? (
              <p className="text-xs text-neutral-400">
                No leases expiring within 90 days.
              </p>
            ) : (
              <div className="space-y-3">
                {expiringLeases.map((agr) => {
                  const remaining = daysUntil(agr.leaseExpiryDate);
                  return (
                    <div
                      key={agr.id}
                      className="flex items-center justify-between border-b border-neutral-100 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CalendarClock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          <p className="text-sm font-medium truncate">
                            {agr.outletName}
                          </p>
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5 ml-5.5">
                          Expires {formatDate(agr.leaseExpiryDate)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[11px] ${
                          remaining <= 30
                            ? "border-red-200 text-red-700 bg-red-50"
                            : remaining <= 60
                            ? "border-amber-200 text-amber-700 bg-amber-50"
                            : "border-neutral-200 text-neutral-600"
                        }`}
                      >
                        {remaining} day{remaining !== 1 ? "s" : ""} left
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Row 3 -- Charts & Risk Flags                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-3 gap-4">
        {/* Outlets by City -- horizontal bar chart */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">
              Outlets by City
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={outletsByCity}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                >
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis
                    type="category"
                    dataKey="city"
                    width={80}
                    tick={{ fontSize: 12, fill: "#737373" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      border: "1px solid #e5e5e5",
                      borderRadius: 8,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    }}
                    formatter={(value) => [`${value ?? 0}`, "Outlets"]}
                  />
                  <Bar
                    dataKey="count"
                    fill="#171717"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Outlets by Status -- donut / pie chart */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">
              Outlets by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={outletsByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    stroke="none"
                  >
                    {outletsByStatus.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      border: "1px solid #e5e5e5",
                      borderRadius: 8,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Risk Flags Summary */}
        <Card className="flex flex-col">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">
              Risk Flags Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 flex-1">
            {/* Counts */}
            <div className="flex gap-4 mb-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-lg font-bold leading-tight">
                    {highFlags.length}
                  </p>
                  <p className="text-[11px] text-neutral-400">High</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-lg font-bold leading-tight">
                    {mediumFlags.length}
                  </p>
                  <p className="text-[11px] text-neutral-400">Medium</p>
                </div>
              </div>
            </div>

            {/* Flag list */}
            <div className="space-y-2 overflow-y-auto max-h-[140px]">
              {/* Deduplicate flags by name */}
              {Array.from(
                new Map(allRiskFlags.map((f) => [f.name, f])).values()
              ).map((flag) => {
                const count = allRiskFlags.filter(
                  (f) => f.name === flag.name
                ).length;
                return (
                  <div
                    key={flag.id}
                    className="flex items-start gap-2 text-xs"
                  >
                    <span
                      className={`mt-1 block w-1.5 h-1.5 rounded-full shrink-0 ${
                        flag.severity === "high"
                          ? "bg-red-500"
                          : "bg-amber-500"
                      }`}
                    />
                    <span className="text-neutral-700">
                      {flag.name}
                      {count > 1 && (
                        <span className="text-neutral-400 ml-1">
                          ({count})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Row 4 -- Overdue Payments table                                    */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Overdue Payments
            </CardTitle>
            <span className="text-xs text-neutral-400">
              {overduePayments.length} record
              {overduePayments.length !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {overduePayments.length === 0 ? (
            <p className="text-xs text-neutral-400">
              No overdue payments at this time.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-neutral-500">
                    Outlet
                  </TableHead>
                  <TableHead className="text-xs font-medium text-neutral-500">
                    Type
                  </TableHead>
                  <TableHead className="text-xs font-medium text-neutral-500">
                    Due Date
                  </TableHead>
                  <TableHead className="text-xs font-medium text-neutral-500 text-right">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs font-medium text-neutral-500 text-right">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overduePayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm font-medium">
                      {p.outletName}
                    </TableCell>
                    <TableCell className="text-sm text-neutral-600">
                      {statusLabel(p.type)}
                    </TableCell>
                    <TableCell className="text-sm text-neutral-600">
                      {formatDate(p.dueDate)}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-right">
                      {formatCurrency(p.dueAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={`text-[11px] ${statusColor(p.status)}`}
                      >
                        {statusLabel(p.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
