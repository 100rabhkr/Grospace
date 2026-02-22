"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getOutlet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Loader2,
  AlertTriangle,
  FileText,
  Clock,
  ShieldAlert,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RiskFlag {
  id: string;
  name: string;
  severity: string;
  explanation: string;
  clause_text?: string;
}

interface Agreement {
  id: string;
  type: string;
  status: string;
  monthly_rent: number;
  cam_monthly?: number;
  security_deposit?: number;
  total_monthly_outflow?: number;
  lease_commencement_date?: string;
  rent_commencement_date?: string;
  lease_expiry_date: string;
  lock_in_end_date?: string;
  escalation_pct?: number;
  escalation_frequency_years?: number;
  lessor_name?: string;
  lessee_name?: string;
  extraction_status?: string;
  document_filename?: string;
  risk_flags: RiskFlag[];
}

interface Obligation {
  id: string;
  type: string;
  amount: number;
  frequency?: string;
  due_date?: string;
  status?: string;
  agreement_id?: string;
}

interface AlertItem {
  id: string;
  type: string;
  title: string;
  message?: string;
  severity?: string;
  status?: string;
  trigger_date: string;
}

interface OutletDetail {
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
}

interface OutletResponse {
  outlet: OutletDetail;
  agreements: Agreement[];
  obligations: Obligation[];
  alerts: AlertItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function propertyTypeLabel(pt: string): string {
  const map: Record<string, string> = {
    mall: "Mall",
    high_street: "High Street",
    cloud_kitchen: "Cloud Kitchen",
    metro: "Metro",
    transit: "Transit",
    cyber_park: "Cyber Park",
    hospital: "Hospital",
    college: "College",
  };
  return map[pt] || pt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function agreementTypeLabel(t: string): string {
  const map: Record<string, string> = {
    lease_loi: "Lease / LOI",
    license_certificate: "License Certificate",
    franchise_agreement: "Franchise Agreement",
  };
  return map[t] || t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function obligationTypeLabel(t: string): string {
  const map: Record<string, string> = {
    rent: "Rent",
    cam: "CAM",
    hvac: "HVAC",
    electricity: "Electricity",
    security_deposit: "Security Deposit",
    cam_deposit: "CAM Deposit",
    license_renewal: "License Renewal",
  };
  return map[t] || t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-blue-50 text-blue-700 border-blue-200",
    pending: "bg-amber-50 text-amber-700",
    paid: "bg-emerald-50 text-emerald-700",
    overdue: "bg-red-50 text-red-700",
    upcoming: "bg-blue-50 text-blue-700",
    triggered: "bg-amber-50 text-amber-700",
    resolved: "bg-emerald-50 text-emerald-700",
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
// Main Page
// ---------------------------------------------------------------------------

export default function OutletDetailPage() {
  const params = useParams();
  const outletId = params.id as string;

  const [data, setData] = useState<OutletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOutlet() {
      try {
        setLoading(true);
        setError(null);
        const response = await getOutlet(outletId);
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load outlet");
      } finally {
        setLoading(false);
      }
    }
    if (outletId) {
      fetchOutlet();
    }
  }, [outletId]);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-500">Loading outlet details...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <h1 className="text-xl font-semibold text-neutral-800">
          {error || "Outlet not found"}
        </h1>
        <p className="text-sm text-neutral-500">
          Could not load details for outlet &quot;{outletId}&quot;.
        </p>
        <Link href="/outlets">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Outlets
          </Button>
        </Link>
      </div>
    );
  }

  const { outlet, agreements, obligations, alerts } = data;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ----------------------------------------------------------------- */}
      {/* HEADER                                                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Link
            href="/outlets"
            className="mt-1.5 p-1.5 rounded-md hover:bg-neutral-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{outlet.name}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
              <Building2 className="h-3.5 w-3.5" />
              <span>{outlet.brand_name}</span>
              <span className="text-neutral-300">|</span>
              <MapPin className="h-3.5 w-3.5" />
              <span>
                {outlet.address}, {outlet.city}, {outlet.state}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className={statusColor(outlet.status)}>
                {statusLabel(outlet.status)}
              </Badge>
              <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                {propertyTypeLabel(outlet.property_type)}
              </Badge>
              {outlet.floor && (
                <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                  {outlet.floor}
                </Badge>
              )}
              {outlet.unit_number && (
                <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                  Unit {outlet.unit_number}
                </Badge>
              )}
              <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                {outlet.franchise_model}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* OUTLET DETAILS CARD                                               */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader>
          <CardTitle className="text-base">Outlet Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-neutral-500 text-xs">Name</span>
              <div className="font-medium">{outlet.name}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Brand</span>
              <div className="font-medium">{outlet.brand_name}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Full Address</span>
              <div className="font-medium">
                {outlet.address}, {outlet.city}, {outlet.state}
              </div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Property Type</span>
              <div className="font-medium">{propertyTypeLabel(outlet.property_type)}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Floor</span>
              <div className="font-medium">{outlet.floor || "--"}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Unit Number</span>
              <div className="font-medium">{outlet.unit_number || "--"}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Super Area</span>
              <div className="font-medium">
                {outlet.super_area_sqft
                  ? `${outlet.super_area_sqft.toLocaleString("en-IN")} sqft`
                  : "--"}
              </div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Covered Area</span>
              <div className="font-medium">
                {outlet.covered_area_sqft
                  ? `${outlet.covered_area_sqft.toLocaleString("en-IN")} sqft`
                  : "--"}
              </div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Franchise Model</span>
              <div className="font-medium">{outlet.franchise_model}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Status</span>
              <div className="mt-0.5">
                <Badge variant="outline" className={statusColor(outlet.status)}>
                  {statusLabel(outlet.status)}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* AGREEMENTS TABLE                                                  */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Linked Agreements
            {agreements.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-neutral-100 text-neutral-600">
                {agreements.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <div className="text-sm text-neutral-500 py-4 text-center">
              No agreements linked to this outlet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-neutral-50 hover:bg-neutral-50">
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Status
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
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Lessor
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide text-right">
                      Security Deposit
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agreements.map((agr) => (
                    <TableRow key={agr.id} className="hover:bg-neutral-50 transition-colors">
                      <TableCell className="text-sm font-medium">
                        {agreementTypeLabel(agr.type)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusColor(agr.status)} border-0 text-xs font-medium`}>
                          {statusLabel(agr.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-right">
                        {agr.monthly_rent > 0 ? formatCurrency(agr.monthly_rent) : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {formatDate(agr.lease_expiry_date)}
                      </TableCell>
                      <TableCell className="text-center">
                        {agr.risk_flags && agr.risk_flags.length > 0 ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                            {agr.risk_flags.length}
                          </Badge>
                        ) : (
                          <span className="text-sm text-neutral-400">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {agr.lessor_name || "--"}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-right">
                        {agr.security_deposit && agr.security_deposit > 0
                          ? formatCurrency(agr.security_deposit)
                          : "--"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/agreements/${agr.id}`}>
                          <Button variant="outline" size="sm" className="text-xs">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* OBLIGATIONS TABLE                                                 */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Obligations
            {obligations.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-neutral-100 text-neutral-600">
                {obligations.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {obligations.length === 0 ? (
            <div className="text-sm text-neutral-500 py-4 text-center">
              No obligations recorded for this outlet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-neutral-50 hover:bg-neutral-50">
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide text-right">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Frequency
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Due Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {obligations.map((obl) => (
                    <TableRow key={obl.id} className="hover:bg-neutral-50 transition-colors">
                      <TableCell className="text-sm font-medium">
                        {obligationTypeLabel(obl.type)}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-right">
                        {obl.amount > 0 ? formatCurrency(obl.amount) : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {obl.frequency
                          ? obl.frequency.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                          : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-neutral-600">
                        {obl.due_date ? formatDate(obl.due_date) : "--"}
                      </TableCell>
                      <TableCell>
                        {obl.status ? (
                          <Badge className={`${statusColor(obl.status)} border-0 text-xs font-medium`}>
                            {statusLabel(obl.status)}
                          </Badge>
                        ) : (
                          <span className="text-sm text-neutral-400">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* ALERTS LIST                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-neutral-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Alerts
            {alerts.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-neutral-100 text-neutral-600">
                {alerts.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-sm text-neutral-500 py-4 text-center">
              No alerts for this outlet.
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-100"
                >
                  <div
                    className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      alert.severity === "high"
                        ? "bg-red-500"
                        : alert.severity === "medium"
                        ? "bg-amber-500"
                        : alert.severity === "low"
                        ? "bg-blue-500"
                        : "bg-neutral-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{alert.title}</span>
                      <Badge variant="outline" className="text-xs">
                        {alert.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Badge>
                      {alert.severity && (
                        <Badge variant="outline" className={`text-xs ${statusColor(alert.severity)}`}>
                          {statusLabel(alert.severity)}
                        </Badge>
                      )}
                      {alert.status && (
                        <Badge variant="outline" className={`text-xs ${statusColor(alert.status)}`}>
                          {statusLabel(alert.status)}
                        </Badge>
                      )}
                    </div>
                    {alert.message && (
                      <p className="text-sm text-neutral-600 mt-1">{alert.message}</p>
                    )}
                    <p className="text-xs text-neutral-400 mt-1">
                      Trigger: {formatDate(alert.trigger_date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
