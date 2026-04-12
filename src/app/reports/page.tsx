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
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  AlertTriangle,
  Loader2,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";

// ---------- Types ----------

type ReportRow = {
  outlet_id: string;
  outlet_name: string;
  brand: string;
  company: string;
  business_category: string;
  city: string;
  state: string;
  property_type: string;
  franchise_model: string;
  outlet_status: string;
  agreement_status: string;
  super_area: number;
  monthly_rent: number;
  rent_per_sqft: number;
  monthly_cam: number;
  total_outflow: number;
  security_deposit: number | null;
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
    pipeline: "bg-muted text-foreground",
    fit_out: "bg-muted text-foreground",
    operational: "bg-emerald-50 text-emerald-700",
    up_for_renewal: "bg-amber-50 text-amber-700",
    renewed: "bg-emerald-50 text-emerald-700",
    closed: "bg-rose-50 text-rose-700",
  };
  return map[status] || "bg-muted text-foreground";
}

function agreementStatusColor(status: string): string {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    draft: "bg-muted text-foreground",
    pending: "bg-amber-50 text-amber-700",
    expired: "bg-rose-50 text-rose-700",
    terminated: "bg-rose-50 text-rose-700",
    renewed: "bg-emerald-50 text-emerald-700",
  };
  return map[status] || "bg-muted text-foreground";
}

function daysToExpiryColor(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 90) return "text-rose-700 bg-rose-50";
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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expiryMin, setExpiryMin] = useState<string>("");
  const [expiryMax, setExpiryMax] = useState<string>("");
  const [hasOverdueFilter, setHasOverdueFilter] = useState<string>("all");
  const [hasRiskFilter, setHasRiskFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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
  const uniqueCompanies = useMemo(() => uniqueValues(allData, "company"), [allData]);
  const uniqueCategories = useMemo(() => uniqueValues(allData, "business_category"), [allData]);
  const uniqueCities = useMemo(() => uniqueValues(allData, "city"), [allData]);
  const uniquePropertyTypes = useMemo(() => uniqueValues(allData, "property_type"), [allData]);
  const uniqueModels = useMemo(() => uniqueValues(allData, "franchise_model"), [allData]);
  const uniqueStatuses = useMemo(() => uniqueValues(allData, "outlet_status"), [allData]);

  // ---------- Filtered + sorted data ----------

  const filteredData = useMemo(() => {
    let data = allData;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      data = data.filter((r) => r.outlet_name.toLowerCase().includes(q));
    }
    if (brandFilter !== "all") data = data.filter((r) => r.brand === brandFilter);
    if (companyFilter !== "all") data = data.filter((r) => (r as Record<string, unknown>).company === companyFilter);
    if (categoryFilter !== "all") data = data.filter((r) => (r as Record<string, unknown>).business_category === categoryFilter);
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
  }, [allData, searchQuery, brandFilter, companyFilter, categoryFilter, cityFilter, propertyTypeFilter, modelFilter, statusFilter, expiryMin, expiryMax, hasOverdueFilter, hasRiskFilter, sortField, sortDirection]);

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
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 ml-1 text-foreground" /> : <ArrowDown className="h-3 w-3 ml-1 text-foreground" />;
  }

  // ---------- CSV Export ----------

  const exportCSV = useCallback(() => {
    const headers = [
      "Outlet Name", "Brand", "City", "State", "Property Type", "Model Type",
      "Outlet Status", "Agreement Status", "Monthly Rent", "CAM",
      "Total Monthly Outflow", "Area (sqft)", "Rent/sqft", "Security Deposit",
      "Lease Expiry Date", "Days to Expiry", "Revenue",
      "Rent-to-Revenue %", "Risk Flags", "Overdue Amount",
    ];

    const csvEscape = (v: unknown) => {
      const s = String(v ?? "N/A");
      return `"${s.replace(/"/g, '""')}"`;
    };

    const rows = filteredData.map((r) => [
      csvEscape(r.outlet_name), csvEscape(r.brand), csvEscape(r.city), csvEscape(r.state),
      csvEscape(statusLabel(r.property_type)), csvEscape(r.franchise_model),
      csvEscape(statusLabel(r.outlet_status)),
      csvEscape(statusLabel(r.agreement_status || "")),
      csvEscape(r.monthly_rent), csvEscape(r.monthly_cam), csvEscape(r.total_outflow),
      csvEscape(r.super_area),
      csvEscape(r.rent_per_sqft),
      csvEscape(r.security_deposit ?? "N/A"),
      csvEscape(r.lease_expiry || "N/A"),
      csvEscape(r.days_to_expiry !== null ? r.days_to_expiry : "N/A"),
      csvEscape(r.revenue ?? "N/A"),
      csvEscape(r.rent_to_revenue !== null ? r.rent_to_revenue.toFixed(1) : "N/A"),
      csvEscape(r.risk_flags_count), csvEscape(r.overdue_amount),
    ]);

    const csvContent = [headers.map((h) => `"${h}"`).join(","), ...rows.map((row) => row.join(","))].join("\n");
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

  // ---------- Excel Export ----------

  const exportExcel = useCallback(() => {
    const headers = [
      "Outlet Name", "Brand", "City", "State", "Property Type", "Model Type",
      "Outlet Status", "Agreement Status", "Monthly Rent", "CAM",
      "Total Monthly Outflow", "Area (sqft)", "Rent/sqft", "Security Deposit",
      "Lease Expiry Date", "Days to Expiry", "Revenue",
      "Rent-to-Revenue %", "Risk Flags", "Overdue Amount",
    ];

    const rows = filteredData.map((r) => [
      r.outlet_name, r.brand, r.city, r.state,
      statusLabel(r.property_type), r.franchise_model,
      statusLabel(r.outlet_status), statusLabel(r.agreement_status || ""),
      r.monthly_rent, r.monthly_cam, r.total_outflow,
      r.super_area, r.rent_per_sqft,
      r.security_deposit ?? "N/A",
      r.lease_expiry || "N/A",
      r.days_to_expiry !== null ? r.days_to_expiry : "N/A",
      r.revenue ?? "N/A",
      r.rent_to_revenue !== null ? r.rent_to_revenue.toFixed(1) : "N/A",
      r.risk_flags_count, r.overdue_amount,
    ].join("\t"));

    const content = [headers.join("\t"), ...rows].join("\n");
    const blob = new Blob([content], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `grospace_report_${new Date().toISOString().split("T")[0]}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredData]);

  // ---------- PDF Export ----------

  const exportPDF = useCallback(() => {
    const headers = [
      "Outlet Name", "Brand", "City", "Property Type", "Model",
      "Status", "Monthly Rent", "CAM", "Total Outflow",
      "Area (sqft)", "Rent/sqft", "Lease Expiry", "Days to Expiry",
      "Risk Flags", "Revenue", "Rent/Rev %", "Overdue",
    ];

    const rows = filteredData.map((r) => [
      r.outlet_name, r.brand, r.city,
      statusLabel(r.property_type), r.franchise_model,
      statusLabel(r.outlet_status),
      r.monthly_rent > 0 ? `Rs ${r.monthly_rent.toLocaleString("en-IN")}` : "--",
      r.monthly_cam > 0 ? `Rs ${r.monthly_cam.toLocaleString("en-IN")}` : "--",
      r.total_outflow > 0 ? `Rs ${r.total_outflow.toLocaleString("en-IN")}` : "--",
      r.super_area > 0 ? r.super_area.toLocaleString("en-IN") : "--",
      r.rent_per_sqft > 0 ? `Rs ${r.rent_per_sqft}` : "--",
      r.lease_expiry ? formatDate(r.lease_expiry) : "--",
      r.days_to_expiry !== null ? String(r.days_to_expiry) : "--",
      String(r.risk_flags_count),
      r.revenue !== null ? `Rs ${r.revenue.toLocaleString("en-IN")}` : "--",
      r.rent_to_revenue !== null ? `${r.rent_to_revenue.toFixed(1)}%` : "--",
      r.overdue_amount > 0 ? `Rs ${r.overdue_amount.toLocaleString("en-IN")}` : "--",
    ]);

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `<!DOCTYPE html>
<html><head><title>GroSpace Outlet Report</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 9px; margin: 12px; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  p { font-size: 10px; color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; white-space: nowrap; }
  th { background: #f5f5f5; font-weight: 600; font-size: 8px; text-transform: uppercase; }
  tr:nth-child(even) { background: #fafafa; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>GroSpace — Outlet Report</h1>
<p>Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} &middot; ${filteredData.length} outlets</p>
<table>
  <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
</table>
</body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  }, [filteredData]);

  // ---------- Clear filters ----------

  function clearFilters() {
    setSearchQuery("");
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
    searchQuery.trim() !== "" ||
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
      <PageHeader title="Outlet Report">
        {!loading && (
          <Badge variant="secondary" className="text-sm">
            {filteredData.length} outlets
          </Badge>
        )}
        <div className="flex items-center gap-1">
          <Button onClick={exportCSV} variant="outline" size="sm" disabled={loading || filteredData.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          <Button onClick={exportExcel} variant="outline" size="sm" disabled={loading || filteredData.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Excel
          </Button>
          <Button onClick={exportPDF} variant="outline" size="sm" disabled={loading || filteredData.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || filteredData.length === 0}
            onClick={() => {
              const subject = encodeURIComponent("GroSpace Portfolio Report");
              const summary = filteredData.slice(0, 10).map(r => `${r.outlet_name} — ${r.city} — Rent: Rs ${(r.monthly_rent || 0).toLocaleString("en-IN")}`).join("\n");
              const body = encodeURIComponent(`Portfolio Report Summary (${filteredData.length} outlets)\n\n${summary}\n\n---\nGenerated from GroSpace`);
              window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
            }}
          >
            <Download className="h-4 w-4 mr-1" />
            Email
          </Button>
        </div>
      </PageHeader>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-700">
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
          {/* Search input for outlet name */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search outlet name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger><SelectValue placeholder="Brand" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {uniqueBrands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>

            {uniqueCompanies.length > 0 && (
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Companies</SelectItem>
                  {uniqueCompanies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {uniqueCategories.length > 0 && (
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {uniqueCategories.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

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
              <SelectTrigger><SelectValue placeholder="Outlet Status" /></SelectTrigger>
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
            <span>Total Rent: <strong className="text-foreground">{formatCurrency(totalRent)}</strong></span>
            <span>Total Outflow: <strong className="text-foreground">{formatCurrency(totalOutflow)}</strong></span>
            <span>Overdue: <strong className={totalOverdue > 0 ? "text-rose-600" : "text-foreground"}>{formatCurrency(totalOverdue)}</strong></span>
            <span>Risk Flags: <strong className={totalRisk > 0 ? "text-rose-600" : "text-foreground"}>{totalRisk}</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading report data...</p>
          </CardContent>
        </Card>
      )}

      {/* ---------- Data Table ---------- */}
      {!loading && !error && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table id="reports-table">
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[180px]" onClick={() => handleSort("outlet_name")}>
                      <span className="flex items-center">Outlet Name<SortIcon field="outlet_name" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("brand")}>
                      <span className="flex items-center">Brand<SortIcon field="brand" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("city")}>
                      <span className="flex items-center">City<SortIcon field="city" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("property_type")}>
                      <span className="flex items-center">Property Type<SortIcon field="property_type" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("franchise_model")}>
                      <span className="flex items-center">Model Type<SortIcon field="franchise_model" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("outlet_status")}>
                      <span className="flex items-center">Outlet Status<SortIcon field="outlet_status" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("agreement_status")}>
                      <span className="flex items-center">Agreement Status<SortIcon field="agreement_status" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("monthly_rent")}>
                      <span className="flex items-center justify-end">Monthly Rent<SortIcon field="monthly_rent" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("monthly_cam")}>
                      <span className="flex items-center justify-end">CAM<SortIcon field="monthly_cam" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("total_outflow")}>
                      <span className="flex items-center justify-end">Total Monthly Outflow<SortIcon field="total_outflow" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("super_area")}>
                      <span className="flex items-center justify-end">Area (sqft)<SortIcon field="super_area" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("rent_per_sqft")}>
                      <span className="flex items-center justify-end">Rent/sqft<SortIcon field="rent_per_sqft" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("security_deposit")}>
                      <span className="flex items-center justify-end">Security Deposit<SortIcon field="security_deposit" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("lease_expiry")}>
                      <span className="flex items-center">Lease Expiry Date<SortIcon field="lease_expiry" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("days_to_expiry")}>
                      <span className="flex items-center justify-end">Days to Expiry<SortIcon field="days_to_expiry" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("risk_flags_count")}>
                      <span className="flex items-center justify-end">Risk Flags<SortIcon field="risk_flags_count" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("revenue")}>
                      <span className="flex items-center justify-end">Revenue<SortIcon field="revenue" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("rent_to_revenue")}>
                      <span className="flex items-center justify-end">Rent/Rev %<SortIcon field="rent_to_revenue" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => handleSort("overdue_amount")}>
                      <span className="flex items-center justify-end">Overdue<SortIcon field="overdue_amount" /></span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={19} className="text-center py-12 text-muted-foreground">
                        No outlets match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((row) => (
                      <TableRow key={row.outlet_id} className="text-sm">
                        <TableCell className="font-medium whitespace-nowrap">{row.outlet_name}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.brand}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.city}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="text-[11px] font-normal">{statusLabel(row.property_type)}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="text-[11px] font-normal">{row.franchise_model}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge className={`${statusColor(row.outlet_status)} border-0 text-[11px]`}>{statusLabel(row.outlet_status)}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.agreement_status ? (
                            <Badge className={`${agreementStatusColor(row.agreement_status)} border-0 text-[11px]`}>{statusLabel(row.agreement_status)}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.monthly_rent > 0 ? formatCurrency(row.monthly_rent) : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.monthly_cam > 0 ? formatCurrency(row.monthly_cam) : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums font-medium">
                          {row.total_outflow > 0 ? formatCurrency(row.total_outflow) : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.super_area > 0 ? row.super_area.toLocaleString("en-IN") : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.rent_per_sqft > 0 ? `Rs ${row.rent_per_sqft}` : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.security_deposit != null && row.security_deposit > 0 ? formatCurrency(row.security_deposit) : "--"}
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
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {row.risk_flags_count > 0 ? (
                            <span className="inline-flex items-center gap-1 text-rose-600">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span className="text-xs font-medium">{row.risk_flags_count}</span>
                            </span>
                          ) : (
                            <span className="text-neutral-300 text-xs">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.revenue !== null ? formatCurrency(row.revenue) : "--"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {row.rent_to_revenue !== null ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium tabular-nums ${row.rent_to_revenue < 12 ? "text-emerald-700 bg-emerald-50" : row.rent_to_revenue <= 18 ? "text-amber-700 bg-amber-50" : "text-rose-700 bg-rose-50"}`}>
                              {row.rent_to_revenue.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {row.overdue_amount > 0 ? (
                            <span className="text-rose-600 font-medium text-xs">{formatCurrency(row.overdue_amount)}</span>
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
