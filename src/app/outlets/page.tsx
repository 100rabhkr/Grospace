"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listOutlets, createOutlet } from "@/lib/api";
import { Pagination } from "@/components/pagination";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, statusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  Search,
  LayoutGrid,
  List,
  Store,
  MapPin,
  Building2,
  Plus,
  Loader2,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OutletAgreement {
  id: string;
  type: string;
  status: string;
  monthly_rent: number;
  lease_expiry_date: string;
  risk_flags: unknown[];
  total_monthly_outflow?: number;
  security_deposit?: number;
}

interface Outlet {
  id: string;
  name: string;
  brand_name: string;
  company_name: string | null;
  business_category: string | null;
  address: string;
  city: string;
  state: string;
  site_code: string | null;
  locality: string | null;
  property_type: string;
  floor: string;
  unit_number: string;
  super_area_sqft: number;
  covered_area_sqft: number;
  franchise_model: string;
  status: string;
  monthly_net_revenue: number | null;
  agreements: OutletAgreement[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function propertyTypeLabel(type: string): string {
  if (!type) return "Unknown";
  const labels: Record<string, string> = {
    mall: "Mall",
    high_street: "High Street",
    cloud_kitchen: "Cloud Kitchen",
    metro: "Metro",
    transit: "Transit",
    cyber_park: "Cyber Park",
    hospital: "Hospital",
    college: "College",
  };
  return labels[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function franchiseModelLabel(model: string): string {
  if (!model) return "Unknown";
  const labels: Record<string, string> = {
    FOFO: "FOFO",
    FOCO: "FOCO",
    COCO: "COCO",
    direct_lease: "Direct Lease",
  };
  return labels[model] || model;
}

function statusLabel(status: string): string {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusColor(status: string): string {
  if (!status) return "bg-muted text-muted-foreground";
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    operational: "bg-emerald-50 text-emerald-700",
    fit_out: "bg-amber-50 text-amber-700",
    expiring: "bg-amber-50 text-amber-700",
    expired: "bg-rose-50 text-rose-700",
    closed: "bg-muted text-muted-foreground",
    draft: "bg-muted text-muted-foreground",
  };
  return map[status] || "bg-muted text-muted-foreground";
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getRentToRevenue(rent: number | undefined, revenue: number | null | undefined): number | null {
  if (!rent || rent <= 0 || !revenue || revenue <= 0) return null;
  return (rent / revenue) * 100;
}

function RentToRevenueBadge({ ratio }: { ratio: number | null }) {
  if (ratio === null) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">
        N/A
      </span>
    );
  }
  const color =
    ratio < 12
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : ratio < 18
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-rose-50 text-rose-700 border-rose-200";
  const label =
    ratio < 12
      ? "Healthy"
      : ratio < 18
      ? "Medium"
      : "High";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-semibold tabular-nums ${color}`}>
      {ratio.toFixed(1)}% {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

function OutletsPageInner() {
  const searchParams = useSearchParams();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  const [searchQuery, setSearchQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("all");
  const [franchiseModelFilter, setFranchiseModelFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"card" | "table">("table");
  const [showCreateOutlet, setShowCreateOutlet] = useState(false);
  const [newOutletName, setNewOutletName] = useState("");
  const [newOutletCity, setNewOutletCity] = useState("");
  const [creatingOutlet, setCreatingOutlet] = useState(false);

  useEffect(() => {
    async function fetchOutlets() {
      try {
        setLoading(true);
        setError(null);
        const data = await listOutlets({ page, page_size: pageSize });
        setOutlets(data.items || []);
        setTotal(data.total || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load outlets");
      } finally {
        setLoading(false);
      }
    }
    fetchOutlets();
  }, [page]);

  // Auto-default to table view when more than 10 outlets
  useEffect(() => {
    if (outlets.length > 10) setViewMode("table");
  }, [outlets.length]);

  // Auto-open create dialog when navigated with ?action=create
  useEffect(() => {
    if (searchParams.get("action") === "create") {
      setShowCreateOutlet(true);
    }
  }, [searchParams]);

  // Derive unique filter options from fetched data
  const uniqueCities = useMemo(
    () => Array.from(new Set(outlets.map((o) => o.city))).sort(),
    [outlets]
  );
  const uniqueStatuses = useMemo(
    () => Array.from(new Set(outlets.map((o) => o.status))).sort(),
    [outlets]
  );
  const uniquePropertyTypes = useMemo(
    () => Array.from(new Set(outlets.map((o) => o.property_type))).sort(),
    [outlets]
  );
  const uniqueFranchiseModels = useMemo(
    () => Array.from(new Set(outlets.map((o) => o.franchise_model))).sort(),
    [outlets]
  );
  const uniqueBrands = useMemo(
    () => Array.from(new Set(outlets.map((o) => o.brand_name).filter(Boolean))).sort(),
    [outlets]
  );
  const uniqueCompanies = useMemo(
    () => Array.from(new Set(outlets.map((o) => o.company_name).filter(Boolean))).sort() as string[],
    [outlets]
  );

  const filteredOutlets = useMemo(() => {
    return outlets.filter((outlet) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          (outlet.name || "").toLowerCase().includes(query) ||
          (outlet.brand_name || "").toLowerCase().includes(query) ||
          (outlet.city || "").toLowerCase().includes(query) ||
          (outlet.address || "").toLowerCase().includes(query) ||
          (outlet.site_code || "").toLowerCase().includes(query) ||
          (outlet.company_name || "").toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      if (cityFilter !== "all" && outlet.city !== cityFilter) return false;
      if (statusFilter !== "all" && outlet.status !== statusFilter) return false;
      if (propertyTypeFilter !== "all" && outlet.property_type !== propertyTypeFilter) return false;
      if (franchiseModelFilter !== "all" && outlet.franchise_model !== franchiseModelFilter) return false;
      if (brandFilter !== "all" && outlet.brand_name !== brandFilter) return false;
      if (companyFilter !== "all" && outlet.company_name !== companyFilter) return false;
      return true;
    });
  }, [outlets, searchQuery, cityFilter, statusFilter, propertyTypeFilter, franchiseModelFilter, brandFilter, companyFilter]);

  const handleCreateOutlet = async () => {
    if (!newOutletName.trim()) return;
    setCreatingOutlet(true);
    try {
      const data = await createOutlet({ name: newOutletName, city: newOutletCity || undefined });
      setShowCreateOutlet(false);
      setNewOutletName("");
      setNewOutletCity("");
      const newId = data.outlet?.id || data.id;
      window.location.href = `/agreements/upload?outlet_id=${newId}`;
    } catch (e) {
      console.error("Failed to create outlet:", e);
      setError("Failed to create outlet. Please try again.");
    } finally {
      setCreatingOutlet(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-card flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading outlets...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <div className="min-h-screen bg-card flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <AlertTriangle className="h-10 w-10 text-rose-500" />
          <p className="text-lg font-medium text-foreground">Failed to load outlets</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="animate-fade-in">
      <div>
        {/* Header */}
        <PageHeader title="Outlets">
          <Badge
            variant="secondary"
            className="bg-muted text-foreground font-medium"
          >
            {filteredOutlets.length} of {outlets.length}
          </Badge>
          <Link href="/recycle-bin">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" />
              Recycle Bin
            </Button>
          </Link>
          <Button
            className="bg-foreground text-white hover:bg-foreground/90"
            onClick={() => setShowCreateOutlet(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Outlet
          </Button>
        </PageHeader>

        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search outlets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* City Dropdown */}
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-full lg:w-44 bg-card border-border text-foreground">
              <SelectValue placeholder="All Cities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {uniqueCities.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Dropdown */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full lg:w-44 bg-card border-border text-foreground">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {uniqueStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Property Type Dropdown */}
          <Select value={propertyTypeFilter} onValueChange={setPropertyTypeFilter}>
            <SelectTrigger className="w-full lg:w-44 bg-card border-border text-foreground">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {uniquePropertyTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {propertyTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Franchise Model Dropdown */}
          <Select value={franchiseModelFilter} onValueChange={setFranchiseModelFilter}>
            <SelectTrigger className="w-full lg:w-44 bg-card border-border text-foreground">
              <SelectValue placeholder="All Models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Models</SelectItem>
              {uniqueFranchiseModels.map((model) => (
                <SelectItem key={model} value={model}>
                  {franchiseModelLabel(model)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Brand Filter */}
          {uniqueBrands.length > 1 && (
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-full lg:w-44 bg-card border-border text-foreground">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {uniqueBrands.map((brand) => (
                  <SelectItem key={brand} value={brand!}>{brand}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Company Filter */}
          {uniqueCompanies.length > 1 && (
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-full lg:w-44 bg-card border-border text-foreground">
                <SelectValue placeholder="All Companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {uniqueCompanies.map((company) => (
                  <SelectItem key={company} value={company}>{company}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* View Toggle */}
          <div className="flex items-center gap-1 ml-auto border border-border rounded-md p-0.5">
            <Button
              variant={viewMode === "card" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("card")}
              className={
                viewMode === "card"
                  ? "bg-foreground text-white hover:bg-foreground/90 h-8 w-8"
                  : "text-muted-foreground hover:text-foreground h-8 w-8"
              }
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("table")}
              className={
                viewMode === "table"
                  ? "bg-foreground text-white hover:bg-foreground/90 h-8 w-8"
                  : "text-muted-foreground hover:text-foreground h-8 w-8"
              }
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Empty State */}
        {outlets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground mb-1">
              No outlets yet
            </p>
            <p className="text-sm text-muted-foreground">
              Outlets will appear here once created via agreement upload.
            </p>
          </div>
        )}

        {/* No results for filters */}
        {outlets.length > 0 && filteredOutlets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground mb-1">
              No outlets found
            </p>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        )}

        {/* Card View */}
        {viewMode === "card" && filteredOutlets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOutlets.map((outlet) => {
              const primaryAgreement = outlet.agreements?.[0] || null;
              return (
                <Link key={outlet.id} href={`/outlets/${outlet.id}`}>
                  <Card className="bg-card border border-border hover:border-border hover:shadow-md transition-all duration-200 cursor-pointer h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground bg-muted border border-border rounded px-2 py-0.5">
                          {outlet.brand_name}
                        </span>
                        <Badge
                          className={`${statusColor(outlet.status)} border-0 text-xs font-medium`}
                        >
                          {statusLabel(outlet.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-md bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {(outlet as unknown as Record<string, unknown>).profile_photo_url ? (
                            <img src={(outlet as unknown as Record<string, unknown>).profile_photo_url as string} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Store className="h-4 w-4 text-muted-foreground/40" />
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-foreground leading-tight">
                          {outlet.name}
                        </h3>
                        {outlet.site_code && (
                          <span className="font-mono text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {outlet.site_code}
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {/* Location */}
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span>
                          {outlet.city}, {outlet.address}
                        </span>
                      </div>

                      {/* Property Type */}
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span>
                          {propertyTypeLabel(outlet.property_type)}
                          {outlet.floor ? ` -- ${outlet.floor}` : ""}
                        </span>
                      </div>

                      {/* Metrics */}
                      <div className="border-t border-border pt-3 mt-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                              Area
                            </p>
                            <p className="text-sm font-semibold text-foreground">
                              {outlet.super_area_sqft
                                ? outlet.super_area_sqft.toLocaleString("en-IN") + " sqft"
                                : "--"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                              Model
                            </p>
                            <p className="text-sm font-semibold text-foreground">
                              {franchiseModelLabel(outlet.franchise_model)}
                            </p>
                          </div>
                          {primaryAgreement && (
                            <>
                              <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                  Monthly Rent
                                </p>
                                <p className="text-sm font-semibold text-foreground">
                                  {primaryAgreement.monthly_rent > 0
                                    ? formatCurrency(primaryAgreement.monthly_rent)
                                    : "--"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                  Lease Expiry
                                </p>
                                <p className="text-sm font-semibold text-foreground">
                                  {formatDate(primaryAgreement.lease_expiry_date)}
                                </p>
                              </div>
                            </>
                          )}
                          {/* Rent-to-Revenue Ratio */}
                          <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                              Rent/Revenue
                            </p>
                            <div className="mt-0.5">
                              <RentToRevenueBadge
                                ratio={getRentToRevenue(
                                  primaryAgreement?.monthly_rent,
                                  outlet.monthly_net_revenue
                                )}
                              />
                            </div>
                          </div>
                          {primaryAgreement && primaryAgreement.risk_flags && primaryAgreement.risk_flags.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                Risk Flags
                              </p>
                              <Badge variant="outline" className="mt-0.5 bg-rose-50 text-rose-700 border-rose-200 text-xs">
                                {primaryAgreement.risk_flags.length} flag{primaryAgreement.risk_flags.length !== 1 ? "s" : ""}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* Table View */}
        {viewMode === "table" && filteredOutlets.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden elevation-1">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Outlet</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Area</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead className="text-right">Outflow</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead>Lease Expiry</TableHead>
                  <TableHead className="text-right">Tenure</TableHead>
                  <TableHead className="text-right">R/R</TableHead>
                  <TableHead className="text-right">Risks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOutlets.map((outlet) => {
                  const primaryAgreement = outlet.agreements?.[0] || null;
                  return (
                    <TableRow
                      key={outlet.id}
                      className="cursor-pointer h-12"
                    >
                      {/* Primary column — strongest text */}
                      <TableCell>
                        <Link
                          href={`/outlets/${outlet.id}`}
                          className="flex items-center gap-3 group"
                        >
                          <div className="h-8 w-8 rounded-md bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center ring-1 ring-border">
                            {(outlet as unknown as Record<string, unknown>).profile_photo_url ? (
                              <img src={(outlet as unknown as Record<string, unknown>).profile_photo_url as string} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Store className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={1.75} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-foreground group-hover:underline truncate">
                              {outlet.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {outlet.brand_name || "—"}
                            </p>
                          </div>
                        </Link>
                      </TableCell>

                      <TableCell>
                        {outlet.site_code ? (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {outlet.site_code}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {outlet.city || "—"}
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {propertyTypeLabel(outlet.property_type) || "—"}
                      </TableCell>

                      <TableCell>
                        <StatusBadge tone={statusTone(outlet.status)}>
                          {statusLabel(outlet.status)}
                        </StatusBadge>
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {franchiseModelLabel(outlet.franchise_model) || "—"}
                      </TableCell>

                      <TableCell className="text-right text-foreground tabular-nums font-medium">
                        {outlet.super_area_sqft
                          ? outlet.super_area_sqft.toLocaleString("en-IN")
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right text-foreground tabular-nums font-semibold">
                        {primaryAgreement && primaryAgreement.monthly_rent > 0
                          ? formatCurrency(primaryAgreement.monthly_rent)
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {primaryAgreement?.total_monthly_outflow
                          ? formatCurrency(primaryAgreement.total_monthly_outflow)
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {outlet.monthly_net_revenue
                          ? formatCurrency(outlet.monthly_net_revenue)
                          : "—"}
                      </TableCell>

                      <TableCell className="text-muted-foreground tabular-nums">
                        {primaryAgreement
                          ? formatDate(primaryAgreement.lease_expiry_date)
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        {(() => {
                          if (!primaryAgreement?.lease_expiry_date) return <span className="text-[11px] text-muted-foreground">—</span>;
                          const months = Math.ceil((new Date(primaryAgreement.lease_expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
                          if (months <= 0) return <StatusBadge tone="danger" bare>Expired</StatusBadge>;
                          const tone = months < 3 ? "danger" : months < 12 ? "warning" : "success";
                          return (
                            <StatusBadge tone={tone as "danger" | "warning" | "success"} bare>
                              {months < 12 ? `${months}mo` : `${Math.round(months / 12)}y ${months % 12}m`}
                            </StatusBadge>
                          );
                        })()}
                      </TableCell>

                      <TableCell className="text-right">
                        <RentToRevenueBadge
                          ratio={getRentToRevenue(
                            primaryAgreement?.monthly_rent,
                            outlet.monthly_net_revenue
                          )}
                        />
                      </TableCell>

                      <TableCell className="text-right">
                        {primaryAgreement && primaryAgreement.risk_flags && primaryAgreement.risk_flags.length > 0 ? (
                          <StatusBadge tone="danger" bare>
                            {primaryAgreement.risk_flags.length}
                          </StatusBadge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {/* Pagination */}
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </div>

      {/* Create Outlet Dialog */}
      <Dialog open={showCreateOutlet} onOpenChange={setShowCreateOutlet}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Store className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <DialogTitle className="text-[17px] font-semibold tracking-tight">
                  Create New Outlet
                </DialogTitle>
                <DialogDescription className="text-[12.5px] text-muted-foreground mt-0.5">
                  You can attach lease documents after creation.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="outlet-name" className="text-[12px] font-semibold text-foreground">
                Outlet Name
              </Label>
              <Input
                id="outlet-name"
                placeholder="e.g., Saket Select Citywalk"
                value={newOutletName}
                onChange={(e) => setNewOutletName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="outlet-city" className="text-[12px] font-semibold text-foreground">
                City
              </Label>
              <Input
                id="outlet-city"
                placeholder="e.g., New Delhi"
                value={newOutletCity}
                onChange={(e) => setNewOutletCity(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowCreateOutlet(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOutlet} disabled={!newOutletName.trim() || creatingOutlet}>
              {creatingOutlet ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Outlet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OutletsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin h-8 w-8 border-2 border-foreground border-t-transparent rounded-full" /></div>}>
      <OutletsPageInner />
    </Suspense>
  );
}
