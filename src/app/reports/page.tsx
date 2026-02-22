"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { getReportData } from "@/lib/api";
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
  Loader2,
} from "lucide-react";

// ---------- Types ----------

type ReportRow = {
  outlet_id: string;
  outlet_name: string;
  brand: string;
  city: string;
  state: string;
  property_type: string;
  franchise_model: string;
  outlet_status: string;
  super_area: number;
  monthly_rent: number;
  rent_per_sqft: number;
  monthly_cam: number;
  total_outflow: number;
  lease_expiry: string;
  days_to_expiry: number | null;
  revenue: number | null;
  rent_to_revenue: number | null;
  risk_flags_count: number;
  overdue_amount: number;
};

type SortField = keyof ReportRow;
type SortDirection = "asc" | "desc";

// ---------- Helpers ----------

function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `Rs ${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `Rs ${(amount / 100000).toFixed(2)} L`;
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(s: string): string {
  return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    pipeline: "bg-neutral-100 text-neutral-600",
    fit_out: "bg-blue-100 text-blue-800",
    operational: "bg-emerald-100 text-emerald-800",
    up_for_renewal: "bg-amber-100 text-amber-800",
    renewed: "bg-green-100 text-green-800",
    closed: "bg-red-100 text-red-800",
  };
  return map[status] || "bg-neutral-100 text-neutral-600";
}

function rentToRevenueColor(pct: number | null): string {
  if (pct === null) return "text-neutral-400";
  if (pct < 12) return "text-emerald-700 bg-emerald-50";
  if (pct <= 18) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

function daysToExpiryColor(days: number | null): string {
  if (days === null) return "text-neutral-400";
  if (days < 90) return "text-red-700 bg-red-50";
  if (days <= 180) return "text-amber-700 bg-amber-50";
  return "text-emerald-700 bg-emerald-50";
}

function uniqueValues(arr: ReportRow[], key: keyof ReportRow): string[] {
  const vals = new Set(arr.map((item) => String(item[key] || "")));
  vals.delete("");
  return Array.from(vals).sort();
}

// ---------- Component ----------

export default function ReportsPage() {
  // Data state
  const [allData, setAllData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const [sortField, setSortField] = useState<SortField>("outlet_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // ---------- Fetch data ----------

  useEffect(() => {
    let cancelled = false;

    async function fetchReport() {
      try {
        setLoading(true);
        setError(null);
        const data = await getReportData();
        if (!cancelled) {
          setAllData(data.report || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchReport();
    return () => { cancelled = true; };
  }, []);

  // Derived unique values for filter options
  const uniqueBrands = useMemo(() => uniqueValues(allData, "brand"), [allData]);
  const uniqueCities = useMemo(() => uniqueValues(allData, "city"), [allData]);
  const uniquePropertyTypes = useMemo(() => uniqueValues(allData, "property_type"), [allData]);
  const uniqueModels = useMemo(() => uniqueValues(allData, "franchise_model"), [allData]);
  const uniqueStatuses = useMemo(() => uniqueValues(allData, "outlet_status"), [allData]);

  // ---------- Filtered + sorted data ----------

  const filteredData = useMemo(() => {
    let data = allData;

    if (brandFilter !== "all") data = data.filter((r) => r.brand === brandFilter);
    if (cityFilter !== "all") data = data.filter((r) => r.city === cityFilter);
    if (propertyTypeFilter !== "all") data = data.filter((r) => r.property_type === propertyTypeFilter);
    if (modelFilter !== "all") data = data.filter((r) => r.franchise_model === modelFilter);
    if (statusFilter !== "all") data = data.filter((r) => r.outlet_status === statusFilter);
    if (expiryMin) data = data.filter((r) => r.lease_expiry && r.lease_expiry >= expiryMin);
    if (expiryMax) data = data.filter((r) => r.lease_expiry && r.lease_expiry <= expiryMax);
    if (hasOverdueFilter === "yes") data = data.filter((r) => r.overdue_amount > 0);
    else if (hasOverdueFilter === "no") data = data.filter((r) => r.overdue_amount === 0);
    if (hasRiskFilter === "yes") data = data.filter((r) => r.risk_flags_count > 0);
    else if (hasRiskFilter === "no") data = data.filter((r) => r.risk_flags_count === 0);

    const sorted = [...data].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") comparison = aVal.localeCompare(bVal);
      else if (typeof aVal === "number" && typeof bVal === "number") comparison = aVal - bVal;
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [allData, brandFilter, cityFilter, propertyTypeFilter, modelFilter, statusFilter, expiryMin, expiryMax, hasOverdueFilter, hasRiskFilter, sortField, sortDirection]);

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
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-neutral-300" />;
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 ml-1 text-black" /> : <ArrowDown className="h-3 w-3 ml-1 text-black" />;
  }

  // ---------- CSV Export ----------

  const exportCSV = useCallback(() => {
    const headers = [
      "Outlet Name", "Brand", "City", "State", "Property Type", "Model Type",
      "Status", "Super Area (sqft)", "Monthly Rent", "Rent/sqft", "Monthly CAM",
      "Total Outflow", "Lease Expiry", "Days to Expiry", "Revenue",
      "Rent-to-Revenue %", "Risk Flags", "Overdue Amount",
    ];

    const rows = filteredData.map((r) => [
      `"${r.outlet_name}"`, `"${r.brand}"`, `"${r.city}"`, `"${r.state}"`,
      `"${statusLabel(r.property_type)}"`, r.franchise_model,
      `"${statusLabel(r.outlet_status)}"`, r.super_area,
      r.monthly_rent, r.rent_per_sqft, r.monthly_cam, r.total_outflow,
      r.lease_expiry || "N/A",
      r.days_to_expiry !== null ? r.days_to_expiry : "N/A",
      r.revenue ?? "N/A",
      r.rent_to_revenue !== null ? r.rent_to_revenue.toFixed(1) : "N/A",
      r.risk_flags_count, r.overdue_amount,
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
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
    brandFilter !== "all" || cityFilter !== "all" || propertyTypeFilter !== "all" ||
    modelFilter !== "all" || statusFilter !== "all" || expiryMin !== "" ||
    expiryMax !== "" || hasOverdueFilter !== "all" || hasRiskFilter !== "all";

  // ---------- Aggregates ----------

  const totalRent = filteredData.reduce((s, r) => s + r.monthly_rent, 0);
  const totalOutflow = filteredData.reduce((s, r) => s + r.total_outflow, 0);
  const totalOverdue = filteredData.reduce((s, r) => s + r.overdue_amount, 0);
  const totalRisk = filteredData.reduce((s, r) => s + r.risk_flags_count, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ---------- Header ---------- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-6 w-6 text-neutral-700" />
          <h1 className="text-xl font-semibold tracking-tight text-black">Outlet Report</h1>
          {!loading && (
            <Badge variant="secondary" className="text-sm">
              {filteredData.length} outlets
            </Badge>
          )}
        </div>
        <Button onClick={exportCSV} disabled={loading || filteredData.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-red-200 bg-red-50 text-red-800">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Failed to load report data</p>
            <p className="text-sm">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      {/* ---------- Filter Bar ---------- */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger><SelectValue placeholder="Brand" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {uniqueBrands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger><SelectValue placeholder="City" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {uniqueCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={propertyTypeFilter} onValueChange={setPropertyTypeFilter}>
              <SelectTrigger><SelectValue placeholder="Property Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Property Types</SelectItem>
                {uniquePropertyTypes.map((pt) => <SelectItem key={pt} value={pt}>{statusLabel(pt)}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger><SelectValue placeholder="Model Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {uniqueModels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {uniqueStatuses.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Expiry From</label>
              <Input type="date" value={expiryMin} onChange={(e) => setExpiryMin(e.target.value)} className="h-9" />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Expiry To</label>
              <Input type="date" value={expiryMax} onChange={(e) => setExpiryMax(e.target.value)} className="h-9" />
            </div>

            <Select value={hasOverdueFilter} onValueChange={setHasOverdueFilter}>
              <SelectTrigger><SelectValue placeholder="Has Overdue" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Overdue: Any</SelectItem>
                <SelectItem value="yes">Has Overdue</SelectItem>
                <SelectItem value="no">No Overdue</SelectItem>
              </SelectContent>
            </Select>

            <Select value={hasRiskFilter} onValueChange={setHasRiskFilter}>
              <SelectTrigger><SelectValue placeholder="Has Risks" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Risks: Any</SelectItem>
                <SelectItem value="yes">Has Risk Flags</SelectItem>
                <SelectItem value="no">No Risk Flags</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="self-end h-9">
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Aggregates bar */}
          <div className="flex items-center gap-6 mt-4 pt-4 border-t text-xs text-muted-foreground">
            <span>Total Rent: <strong className="text-black">{formatCurrency(totalRent)}</strong></span>
            <span>Total Outflow: <strong className="text-black">{formatCurrency(totalOutflow)}</strong></span>
            <span>Overdue: <strong className={totalOverdue > 0 ? "text-red-700" : "text-black"}>{formatCurrency(totalOverdue)}</strong></span>
            <span>Risk Flags: <strong className={totalRisk > 0 ? "text-amber-700" : "text-black"}>{totalRisk}</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading report data...</p>
          </CardContent>
        </Card>
      )}

      {/* ---------- Data Table ---------- */}
      {!loading && !error && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-neutral-50/80">
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[180px]" onClick={() => handleSort("outlet_name")}>
                      <span className="flex items-center">Outlet Name<SortIcon field="outlet_name" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("brand")}>
                      <span className="flex items-center">Brand<SortIcon field="brand" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("city")}>
                      <span className="flex items-center">City<SortIcon field="city" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("state")}>
                      <span className="flex items-center">State<SortIcon field="state" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("property_type")}>
                      <span className="flex items-center">Property<SortIcon field="property_type" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("franchise_model")}>
                      <span className="flex items-center">Model<SortIcon field="franchise_model" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("outlet_status")}>
                      <span className="flex items-center">Status<SortIcon field="outlet_status" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("super_area")}>
                      <span className="flex items-center justify-end">Area (sqft)<SortIcon field="super_area" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("monthly_rent")}>
                      <span className="flex items-center justify-end">Rent<SortIcon field="monthly_rent" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("rent_per_sqft")}>
                      <span className="flex items-center justify-end">Rent/sqft<SortIcon field="rent_per_sqft" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("monthly_cam")}>
                      <span className="flex items-center justify-end">CAM<SortIcon field="monthly_cam" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("total_outflow")}>
                      <span className="flex items-center justify-end">Total Outflow<SortIcon field="total_outflow" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("lease_expiry")}>
                      <span className="flex items-center">Lease Expiry<SortIcon field="lease_expiry" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("days_to_expiry")}>
                      <span className="flex items-center justify-end">Days Left<SortIcon field="days_to_expiry" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("revenue")}>
                      <span className="flex items-center justify-end">Revenue<SortIcon field="revenue" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("rent_to_revenue")}>
                      <span className="flex items-center justify-end">Rent/Rev %<SortIcon field="rent_to_revenue" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("risk_flags_count")}>
                      <span className="flex items-center justify-end">Risks<SortIcon field="risk_flags_count" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("overdue_amount")}>
                      <span className="flex items-center justify-end">Overdue<SortIcon field="overdue_amount" /></span>
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
                      <TableRow key={row.outlet_id} className="text-sm">
                        <TableCell className="font-medium whitespace-nowrap">{row.outlet_name}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.brand}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.city}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.state}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="text-[11px] font-normal">{statusLabel(row.property_type)}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="text-[11px] font-normal">{row.franchise_model}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge className={`${statusColor(row.outlet_status)} border-0 text-[11px]`}>{statusLabel(row.outlet_status)}</Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.super_area > 0 ? row.super_area.toLocaleString("en-IN") : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.monthly_rent > 0 ? formatCurrency(row.monthly_rent) : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.rent_per_sqft > 0 ? `Rs ${row.rent_per_sqft}` : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.monthly_cam > 0 ? formatCurrency(row.monthly_cam) : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums font-medium">
                          {row.total_outflow > 0 ? formatCurrency(row.total_outflow) : "--"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.lease_expiry ? formatDate(row.lease_expiry) : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {row.days_to_expiry !== null ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium tabular-nums ${daysToExpiryColor(row.days_to_expiry)}`}>
                              {row.days_to_expiry}
                            </span>
                          ) : (
                            <span className="text-neutral-400">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.revenue !== null ? formatCurrency(row.revenue) : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {row.rent_to_revenue !== null ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium tabular-nums ${rentToRevenueColor(row.rent_to_revenue)}`}>
                              {row.rent_to_revenue.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-neutral-400">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {row.risk_flags_count > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span className="text-xs font-medium">{row.risk_flags_count}</span>
                            </span>
                          ) : (
                            <span className="text-neutral-300 text-xs">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.overdue_amount > 0 ? (
                            <span className="text-red-700 font-medium text-xs">{formatCurrency(row.overdue_amount)}</span>
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
      )}
    </div>
  );
}
