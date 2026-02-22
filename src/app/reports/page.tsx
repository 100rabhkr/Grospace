"use client";

import { useState, useMemo, useCallback } from "react";
import {
  outlets,
  agreements,
  paymentRecords,
  formatCurrency,
  formatDate,
  daysUntil,
  statusColor,
  statusLabel,
} from "@/lib/mock-data";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSpreadsheet,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  AlertTriangle,
} from "lucide-react";

// ---------- Types ----------

type ReportRow = {
  outletId: string;
  outletName: string;
  brand: string;
  city: string;
  state: string;
  propertyType: string;
  franchiseModel: string;
  outletStatus: string;
  superArea: number;
  monthlyRent: number;
  rentPerSqft: number;
  monthlyCam: number;
  totalOutflow: number;
  leaseExpiry: string;
  daysToExpiry: number;
  revenue: number | null;
  rentToRevenue: number | null;
  riskFlagsCount: number;
  overdueAmount: number;
};

type SortField = keyof ReportRow;
type SortDirection = "asc" | "desc";

// ---------- Build joined data ----------

function buildReportData(): ReportRow[] {
  return outlets.map((outlet) => {
    // Find the primary lease agreement for this outlet
    const outletAgreements = agreements.filter(
      (a) => a.outletId === outlet.id && a.type === "lease_loi"
    );
    const primaryAgreement =
      outletAgreements.find((a) => a.status === "active" || a.status === "expiring") ||
      outletAgreements[0] ||
      null;

    // Find overdue payments for this outlet
    const outletPayments = paymentRecords.filter(
      (p) => p.outletId === outlet.id && p.status === "overdue"
    );
    const overdueAmount = outletPayments.reduce((sum, p) => sum + p.dueAmount, 0);

    const monthlyRent = primaryAgreement?.monthlyRent ?? 0;
    const rentPerSqft = primaryAgreement?.rentPerSqft ?? 0;
    const monthlyCam = primaryAgreement?.camMonthly ?? 0;
    const totalOutflow = primaryAgreement?.totalMonthlyOutflow ?? 0;
    const leaseExpiry = primaryAgreement?.leaseExpiryDate ?? "";
    const daysToExpiryVal = leaseExpiry ? daysUntil(leaseExpiry) : 9999;
    const riskFlagsCount = primaryAgreement?.riskFlags.length ?? 0;

    const revenue = outlet.monthlyNetRevenue;
    const rentToRevenue =
      revenue && revenue > 0 && totalOutflow > 0
        ? (totalOutflow / revenue) * 100
        : null;

    return {
      outletId: outlet.id,
      outletName: outlet.name,
      brand: outlet.brandName,
      city: outlet.city,
      state: outlet.state,
      propertyType: outlet.propertyType,
      franchiseModel: outlet.franchiseModel,
      outletStatus: outlet.status,
      superArea: outlet.superAreaSqft,
      monthlyRent,
      rentPerSqft,
      monthlyCam,
      totalOutflow,
      leaseExpiry,
      daysToExpiry: daysToExpiryVal,
      revenue,
      rentToRevenue,
      riskFlagsCount,
      overdueAmount,
    };
  });
}

// ---------- Helpers ----------

function rentToRevenueColor(pct: number | null): string {
  if (pct === null) return "text-neutral-400";
  if (pct < 12) return "text-emerald-700 bg-emerald-50";
  if (pct <= 18) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

function daysToExpiryColor(days: number): string {
  if (days === 9999) return "text-neutral-400";
  if (days < 90) return "text-red-700 bg-red-50";
  if (days <= 180) return "text-amber-700 bg-amber-50";
  return "text-emerald-700 bg-emerald-50";
}

// Unique values helpers
function uniqueValues<T>(arr: T[], key: keyof T): string[] {
  const vals = new Set(arr.map((item) => String(item[key])));
  return Array.from(vals).sort();
}

// ---------- Component ----------

export default function ReportsPage() {
  const allData = useMemo(() => buildReportData(), []);

  // Filters
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expiryMin, setExpiryMin] = useState<string>("");
  const [expiryMax, setExpiryMax] = useState<string>("");
  const [hasOverdueFilter, setHasOverdueFilter] = useState<string>("all");
  const [hasRiskFilter, setHasRiskFilter] = useState<string>("all");

  // Sort
  const [sortField, setSortField] = useState<SortField>("outletName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Derived unique values for filter options
  const uniqueBrands = useMemo(() => uniqueValues(allData, "brand"), [allData]);
  const uniqueCities = useMemo(() => uniqueValues(allData, "city"), [allData]);
  const uniquePropertyTypes = useMemo(() => uniqueValues(allData, "propertyType"), [allData]);
  const uniqueModels = useMemo(() => uniqueValues(allData, "franchiseModel"), [allData]);
  const uniqueStatuses = useMemo(() => uniqueValues(allData, "outletStatus"), [allData]);

  // ---------- Filtered + sorted data ----------

  const filteredData = useMemo(() => {
    let data = allData;

    if (brandFilter !== "all") {
      data = data.filter((r) => r.brand === brandFilter);
    }
    if (cityFilter !== "all") {
      data = data.filter((r) => r.city === cityFilter);
    }
    if (propertyTypeFilter !== "all") {
      data = data.filter((r) => r.propertyType === propertyTypeFilter);
    }
    if (modelFilter !== "all") {
      data = data.filter((r) => r.franchiseModel === modelFilter);
    }
    if (statusFilter !== "all") {
      data = data.filter((r) => r.outletStatus === statusFilter);
    }
    if (expiryMin) {
      data = data.filter((r) => r.leaseExpiry && r.leaseExpiry >= expiryMin);
    }
    if (expiryMax) {
      data = data.filter((r) => r.leaseExpiry && r.leaseExpiry <= expiryMax);
    }
    if (hasOverdueFilter === "yes") {
      data = data.filter((r) => r.overdueAmount > 0);
    } else if (hasOverdueFilter === "no") {
      data = data.filter((r) => r.overdueAmount === 0);
    }
    if (hasRiskFilter === "yes") {
      data = data.filter((r) => r.riskFlagsCount > 0);
    } else if (hasRiskFilter === "no") {
      data = data.filter((r) => r.riskFlagsCount === 0);
    }

    // Sort
    const sorted = [...data].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [
    allData,
    brandFilter,
    cityFilter,
    propertyTypeFilter,
    modelFilter,
    statusFilter,
    expiryMin,
    expiryMax,
    hasOverdueFilter,
    hasRiskFilter,
    sortField,
    sortDirection,
  ]);

  // ---------- Sort handler ----------

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 text-neutral-300" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 text-black" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-black" />
    );
  }

  // ---------- CSV Export ----------

  const exportCSV = useCallback(() => {
    const headers = [
      "Outlet Name",
      "Brand",
      "City",
      "State",
      "Property Type",
      "Model Type",
      "Status",
      "Super Area (sqft)",
      "Monthly Rent",
      "Rent/sqft",
      "Monthly CAM",
      "Total Outflow",
      "Lease Expiry",
      "Days to Expiry",
      "Revenue",
      "Rent-to-Revenue %",
      "Risk Flags",
      "Overdue Amount",
    ];

    const rows = filteredData.map((r) => [
      `"${r.outletName}"`,
      `"${r.brand}"`,
      `"${r.city}"`,
      `"${r.state}"`,
      `"${statusLabel(r.propertyType)}"`,
      r.franchiseModel,
      `"${statusLabel(r.outletStatus)}"`,
      r.superArea,
      r.monthlyRent,
      r.rentPerSqft,
      r.monthlyCam,
      r.totalOutflow,
      r.leaseExpiry || "N/A",
      r.daysToExpiry === 9999 ? "N/A" : r.daysToExpiry,
      r.revenue ?? "N/A",
      r.rentToRevenue !== null ? r.rentToRevenue.toFixed(1) : "N/A",
      r.riskFlagsCount,
      r.overdueAmount,
    ]);

    const csvContent =
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `grospace_outlet_report_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredData]);

  // ---------- Clear filters ----------

  function clearFilters() {
    setBrandFilter("all");
    setCityFilter("all");
    setPropertyTypeFilter("all");
    setModelFilter("all");
    setStatusFilter("all");
    setExpiryMin("");
    setExpiryMax("");
    setHasOverdueFilter("all");
    setHasRiskFilter("all");
  }

  const hasActiveFilters =
    brandFilter !== "all" ||
    cityFilter !== "all" ||
    propertyTypeFilter !== "all" ||
    modelFilter !== "all" ||
    statusFilter !== "all" ||
    expiryMin !== "" ||
    expiryMax !== "" ||
    hasOverdueFilter !== "all" ||
    hasRiskFilter !== "all";

  // ---------- Aggregates ----------

  const totalRent = filteredData.reduce((s, r) => s + r.monthlyRent, 0);
  const totalOutflow = filteredData.reduce((s, r) => s + r.totalOutflow, 0);
  const totalOverdue = filteredData.reduce((s, r) => s + r.overdueAmount, 0);
  const totalRisk = filteredData.reduce((s, r) => s + r.riskFlagsCount, 0);

  return (
    <div className="space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-6 w-6 text-neutral-700" />
          <h1 className="text-2xl font-bold tracking-tight text-black">Outlet Report</h1>
          <Badge variant="secondary" className="text-sm">
            {filteredData.length} outlets
          </Badge>
        </div>
        <Button onClick={exportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* ---------- Filter Bar ---------- */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Brand */}
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {uniqueBrands.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* City */}
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="City" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {uniqueCities.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Property Type */}
            <Select value={propertyTypeFilter} onValueChange={setPropertyTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Property Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Property Types</SelectItem>
                {uniquePropertyTypes.map((pt) => (
                  <SelectItem key={pt} value={pt}>
                    {statusLabel(pt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Model */}
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Model Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {uniqueModels.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Outlet Status */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {uniqueStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Lease Expiry From */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Expiry From
              </label>
              <Input
                type="date"
                value={expiryMin}
                onChange={(e) => setExpiryMin(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Lease Expiry To */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Expiry To
              </label>
              <Input
                type="date"
                value={expiryMax}
                onChange={(e) => setExpiryMax(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Has Overdue */}
            <Select value={hasOverdueFilter} onValueChange={setHasOverdueFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Has Overdue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Overdue: Any</SelectItem>
                <SelectItem value="yes">Has Overdue</SelectItem>
                <SelectItem value="no">No Overdue</SelectItem>
              </SelectContent>
            </Select>

            {/* Has Risk Flags */}
            <Select value={hasRiskFilter} onValueChange={setHasRiskFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Has Risks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Risks: Any</SelectItem>
                <SelectItem value="yes">Has Risk Flags</SelectItem>
                <SelectItem value="no">No Risk Flags</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="self-end h-9">
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Aggregates bar */}
          <div className="flex items-center gap-6 mt-4 pt-4 border-t text-xs text-muted-foreground">
            <span>
              Total Rent: <strong className="text-black">{formatCurrency(totalRent)}</strong>
            </span>
            <span>
              Total Outflow: <strong className="text-black">{formatCurrency(totalOutflow)}</strong>
            </span>
            <span>
              Overdue:{" "}
              <strong className={totalOverdue > 0 ? "text-red-700" : "text-black"}>
                {formatCurrency(totalOverdue)}
              </strong>
            </span>
            <span>
              Risk Flags:{" "}
              <strong className={totalRisk > 0 ? "text-amber-700" : "text-black"}>
                {totalRisk}
              </strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Data Table ---------- */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-neutral-50/80">
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap min-w-[180px]"
                    onClick={() => handleSort("outletName")}
                  >
                    <span className="flex items-center">
                      Outlet Name
                      <SortIcon field="outletName" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort("brand")}
                  >
                    <span className="flex items-center">
                      Brand
                      <SortIcon field="brand" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort("city")}
                  >
                    <span className="flex items-center">
                      City
                      <SortIcon field="city" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort("state")}
                  >
                    <span className="flex items-center">
                      State
                      <SortIcon field="state" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort("propertyType")}
                  >
                    <span className="flex items-center">
                      Property
                      <SortIcon field="propertyType" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort("franchiseModel")}
                  >
                    <span className="flex items-center">
                      Model
                      <SortIcon field="franchiseModel" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort("outletStatus")}
                  >
                    <span className="flex items-center">
                      Status
                      <SortIcon field="outletStatus" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort("superArea")}
                  >
                    <span className="flex items-center justify-end">
                      Area (sqft)
                      <SortIcon field="superArea" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort("monthlyRent")}
                  >
                    <span className="flex items-center justify-end">
                      Rent
                      <SortIcon field="monthlyRent" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort("rentPerSqft")}
                  >
                    <span className="flex items-center justify-end">
                      Rent/sqft
                      <SortIcon field="rentPerSqft" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort("monthlyCam")}
                  >
                    <span className="flex items-center justify-end">
                      CAM
                      <SortIcon field="monthlyCam" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort("totalOutflow")}
                  >
                    <span className="flex items-center justify-end">
                      Total Outflow
                      <SortIcon field="totalOutflow" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort("leaseExpiry")}
                  >
                    <span className="flex items-center">
                      Lease Expiry
                      <SortIcon field="leaseExpiry" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort("daysToExpiry")}
                  >
                    <span className="flex items-center justify-end">
                      Days Left
                      <SortIcon field="daysToExpiry" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort("revenue")}
                  >
                    <span className="flex items-center justify-end">
                      Revenue
                      <SortIcon field="revenue" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort("rentToRevenue")}
                  >
                    <span className="flex items-center justify-end">
                      Rent/Rev %
                      <SortIcon field="rentToRevenue" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort("riskFlagsCount")}
                  >
                    <span className="flex items-center justify-end">
                      Risks
                      <SortIcon field="riskFlagsCount" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none whitespace-nowrap text-right"
                    onClick={() => handleSort("overdueAmount")}
                  >
                    <span className="flex items-center justify-end">
                      Overdue
                      <SortIcon field="overdueAmount" />
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={18} className="text-center py-12 text-muted-foreground">
                      No outlets match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((row) => (
                    <TableRow key={row.outletId} className="text-sm">
                      <TableCell className="font-medium whitespace-nowrap">
                        {row.outletName}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.brand}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.city}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.state}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {statusLabel(row.propertyType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {row.franchiseModel}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className={`${statusColor(row.outletStatus)} border-0 text-[11px]`}>
                          {statusLabel(row.outletStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {row.superArea.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {row.monthlyRent > 0 ? formatCurrency(row.monthlyRent) : "--"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {row.rentPerSqft > 0 ? `Rs ${row.rentPerSqft}` : "--"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {row.monthlyCam > 0 ? formatCurrency(row.monthlyCam) : "--"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums font-medium">
                        {row.totalOutflow > 0 ? formatCurrency(row.totalOutflow) : "--"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.leaseExpiry ? formatDate(row.leaseExpiry) : "--"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {row.daysToExpiry !== 9999 ? (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium tabular-nums ${daysToExpiryColor(row.daysToExpiry)}`}
                          >
                            {row.daysToExpiry}
                          </span>
                        ) : (
                          <span className="text-neutral-400">--</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {row.revenue !== null ? formatCurrency(row.revenue) : "--"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {row.rentToRevenue !== null ? (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium tabular-nums ${rentToRevenueColor(row.rentToRevenue)}`}
                          >
                            {row.rentToRevenue.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-neutral-400">--</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {row.riskFlagsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">{row.riskFlagsCount}</span>
                          </span>
                        ) : (
                          <span className="text-neutral-300 text-xs">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {row.overdueAmount > 0 ? (
                          <span className="text-red-700 font-medium text-xs">
                            {formatCurrency(row.overdueAmount)}
                          </span>
                        ) : (
                          <span className="text-neutral-300 text-xs">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
