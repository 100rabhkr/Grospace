"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { listOutlets } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  Search,
  LayoutGrid,
  List,
  Store,
  MapPin,
  Building2,
  Plus,
  Loader2,
  AlertTriangle,
} from "lucide-react";

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
}

interface Outlet {
  id: string;
  name: string;
  brand_name: string;
  address: string;
  city: string;
  state: string;
  property_type: string;
  floor: string;
  unit_number: string;
  super_area_sqft: number;
  covered_area_sqft: number;
  franchise_model: string;
  status: string;
  agreements: OutletAgreement[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function propertyTypeLabel(type: string): string {
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
  const labels: Record<string, string> = {
    FOFO: "FOFO",
    FOCO: "FOCO",
    COCO: "COCO",
    direct_lease: "Direct Lease",
  };
  return labels[model] || model;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    operational: "bg-emerald-50 text-emerald-700",
    fit_out: "bg-blue-50 text-blue-700",
    expiring: "bg-amber-50 text-amber-700",
    expired: "bg-red-50 text-red-700",
    closed: "bg-neutral-100 text-neutral-500",
    draft: "bg-neutral-100 text-neutral-600",
  };
  return map[status] || "bg-neutral-100 text-neutral-600";
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

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function OutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("all");
  const [franchiseModelFilter, setFranchiseModelFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");

  useEffect(() => {
    async function fetchOutlets() {
      try {
        setLoading(true);
        setError(null);
        const data = await listOutlets();
        setOutlets(data.outlets || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load outlets");
      } finally {
        setLoading(false);
      }
    }
    fetchOutlets();
  }, []);

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

  const filteredOutlets = useMemo(() => {
    return outlets.filter((outlet) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          outlet.name.toLowerCase().includes(query) ||
          outlet.brand_name.toLowerCase().includes(query) ||
          outlet.city.toLowerCase().includes(query) ||
          outlet.address.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      if (cityFilter !== "all" && outlet.city !== cityFilter) return false;
      if (statusFilter !== "all" && outlet.status !== statusFilter) return false;
      if (propertyTypeFilter !== "all" && outlet.property_type !== propertyTypeFilter) return false;
      if (franchiseModelFilter !== "all" && outlet.franchise_model !== franchiseModelFilter) return false;
      return true;
    });
  }, [outlets, searchQuery, cityFilter, statusFilter, propertyTypeFilter, franchiseModelFilter]);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-500">Loading outlets...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <AlertTriangle className="h-10 w-10 text-red-400" />
          <p className="text-lg font-medium text-neutral-800">Failed to load outlets</p>
          <p className="text-sm text-neutral-500">{error}</p>
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
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-black tracking-tight">
              Outlets
            </h1>
            <Badge
              variant="secondary"
              className="bg-neutral-100 text-neutral-700 font-medium"
            >
              {filteredOutlets.length} of {outlets.length}
            </Badge>
          </div>
          <Link href="/agreements/upload">
            <Button className="bg-black text-white hover:bg-neutral-800">
              <Plus className="h-4 w-4 mr-1" />
              Add Outlet
            </Button>
          </Link>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search outlets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white border-neutral-200 text-black placeholder:text-neutral-400"
            />
          </div>

          {/* City Dropdown */}
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-full lg:w-44 bg-white border-neutral-200 text-black">
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
            <SelectTrigger className="w-full lg:w-44 bg-white border-neutral-200 text-black">
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
            <SelectTrigger className="w-full lg:w-44 bg-white border-neutral-200 text-black">
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
            <SelectTrigger className="w-full lg:w-44 bg-white border-neutral-200 text-black">
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

          {/* View Toggle */}
          <div className="flex items-center gap-1 ml-auto border border-neutral-200 rounded-md p-0.5">
            <Button
              variant={viewMode === "card" ? "default" : "ghost"}
              size="icon"
              onClick={() => setViewMode("card")}
              className={
                viewMode === "card"
                  ? "bg-black text-white hover:bg-neutral-800 h-8 w-8"
                  : "text-neutral-500 hover:text-black h-8 w-8"
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
                  ? "bg-black text-white hover:bg-neutral-800 h-8 w-8"
                  : "text-neutral-500 hover:text-black h-8 w-8"
              }
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Empty State */}
        {outlets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Store className="h-12 w-12 text-neutral-300 mb-4" />
            <p className="text-lg font-medium text-neutral-600 mb-1">
              No outlets yet
            </p>
            <p className="text-sm text-neutral-400">
              Outlets will appear here once created via agreement upload.
            </p>
          </div>
        )}

        {/* No results for filters */}
        {outlets.length > 0 && filteredOutlets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Store className="h-12 w-12 text-neutral-300 mb-4" />
            <p className="text-lg font-medium text-neutral-600 mb-1">
              No outlets found
            </p>
            <p className="text-sm text-neutral-400">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        )}

        {/* Card View */}
        {viewMode === "card" && filteredOutlets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredOutlets.map((outlet) => {
              const primaryAgreement = outlet.agreements?.[0] || null;
              return (
                <Link key={outlet.id} href={`/outlets/${outlet.id}`}>
                  <Card className="bg-white border border-neutral-200 hover:border-neutral-300 hover:shadow-md transition-all duration-200 cursor-pointer h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-neutral-500 bg-neutral-50 border border-neutral-100 rounded px-2 py-0.5">
                          {outlet.brand_name}
                        </span>
                        <Badge
                          className={`${statusColor(outlet.status)} border-0 text-xs font-medium`}
                        >
                          {statusLabel(outlet.status)}
                        </Badge>
                      </div>
                      <h3 className="text-base font-bold text-black leading-tight">
                        {outlet.name}
                      </h3>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {/* Location */}
                      <div className="flex items-center gap-1.5 text-sm text-neutral-600">
                        <MapPin className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                        <span>
                          {outlet.city}, {outlet.address}
                        </span>
                      </div>

                      {/* Property Type */}
                      <div className="flex items-center gap-1.5 text-sm text-neutral-600">
                        <Building2 className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                        <span>
                          {propertyTypeLabel(outlet.property_type)}
                          {outlet.floor ? ` -- ${outlet.floor}` : ""}
                        </span>
                      </div>

                      {/* Metrics */}
                      <div className="border-t border-neutral-100 pt-3 mt-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <div>
                            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
                              Area
                            </p>
                            <p className="text-sm font-semibold text-black">
                              {outlet.super_area_sqft
                                ? outlet.super_area_sqft.toLocaleString("en-IN") + " sqft"
                                : "--"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
                              Model
                            </p>
                            <p className="text-sm font-semibold text-black">
                              {franchiseModelLabel(outlet.franchise_model)}
                            </p>
                          </div>
                          {primaryAgreement && (
                            <>
                              <div>
                                <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
                                  Monthly Rent
                                </p>
                                <p className="text-sm font-semibold text-black">
                                  {primaryAgreement.monthly_rent > 0
                                    ? formatCurrency(primaryAgreement.monthly_rent)
                                    : "--"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
                                  Lease Expiry
                                </p>
                                <p className="text-sm font-semibold text-black">
                                  {formatDate(primaryAgreement.lease_expiry_date)}
                                </p>
                              </div>
                            </>
                          )}
                          {primaryAgreement && primaryAgreement.risk_flags && primaryAgreement.risk_flags.length > 0 && (
                            <div className="col-span-2">
                              <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
                                Risk Flags
                              </p>
                              <Badge variant="outline" className="mt-0.5 bg-red-50 text-red-700 border-red-200 text-xs">
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
          <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-neutral-50 hover:bg-neutral-50">
                  <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    Outlet Name
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    City
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    Property Type
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    Franchise Model
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide text-right">
                    Area (sqft)
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide text-right">
                    Monthly Rent
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    Lease Expiry
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide text-center">
                    Risk Flags
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOutlets.map((outlet) => {
                  const primaryAgreement = outlet.agreements?.[0] || null;
                  return (
                    <TableRow
                      key={outlet.id}
                      className="hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      <TableCell>
                        <Link
                          href={`/outlets/${outlet.id}`}
                          className="text-sm font-medium text-black hover:underline"
                        >
                          {outlet.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {outlet.city}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {propertyTypeLabel(outlet.property_type)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${statusColor(outlet.status)} border-0 text-xs font-medium`}
                        >
                          {statusLabel(outlet.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {franchiseModelLabel(outlet.franchise_model)}
                      </TableCell>
                      <TableCell className="text-sm text-black font-medium text-right">
                        {outlet.super_area_sqft
                          ? outlet.super_area_sqft.toLocaleString("en-IN")
                          : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-black font-medium text-right">
                        {primaryAgreement && primaryAgreement.monthly_rent > 0
                          ? formatCurrency(primaryAgreement.monthly_rent)
                          : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {primaryAgreement
                          ? formatDate(primaryAgreement.lease_expiry_date)
                          : "--"}
                      </TableCell>
                      <TableCell className="text-center">
                        {primaryAgreement && primaryAgreement.risk_flags && primaryAgreement.risk_flags.length > 0 ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                            {primaryAgreement.risk_flags.length}
                          </Badge>
                        ) : (
                          <span className="text-sm text-neutral-400">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
