"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getOrganization } from "@/lib/api";
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
  Store,
  FileCheck,
  Bell,
  ArrowLeft,
  MapPin,
  Calendar,
  Loader2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Organization {
  id: string;
  name: string;
  created_at: string;
}

interface Outlet {
  id: string;
  name: string;
  brand_name: string;
  city: string;
  state: string;
  property_type: string;
  status: string;
  super_area_sqft: number;
  franchise_model: string;
}

interface Agreement {
  id: string;
  type: string;
  status: string;
  document_filename: string;
  monthly_rent: number;
  lease_expiry_date: string;
  outlet_id: string;
  outlets: { name: string; city: string };
}

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  trigger_date: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  if (!amount) return "--";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusColor(status: string): string {
  if (!status) return "bg-muted text-foreground";
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    operational: "bg-emerald-50 text-emerald-700",
    fit_out: "bg-amber-50 text-amber-700",
    expiring: "bg-amber-50 text-amber-700",
    up_for_renewal: "bg-amber-50 text-amber-700",
    expired: "bg-rose-50 text-rose-700",
    closed: "bg-muted text-foreground",
    draft: "bg-muted text-foreground",
    pipeline: "bg-muted text-foreground",
    pending: "bg-amber-50 text-amber-700",
  };
  return map[status] || "bg-muted text-foreground";
}

function statusLabel(status: string): string {
  if (!status) return "Unknown";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function severityColor(severity: string): string {
  if (!severity) return "bg-muted text-foreground";
  const map: Record<string, string> = {
    high: "bg-rose-50 text-rose-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-muted text-foreground",
    info: "bg-muted text-foreground",
  };
  return map[severity] || "bg-muted text-foreground";
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function OrganizationDetailPage() {
  const params = useParams();
  const orgId = params.id as string;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const data = await getOrganization(orgId);
        setOrganization(data.organization);
        setOutlets(data.outlets || []);
        setAgreements(data.agreements || []);
        setAlerts(data.alerts || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load organization"
        );
      } finally {
        setLoading(false);
      }
    }
    if (orgId) fetchData();
  }, [orgId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-card flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading organization...</p>
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="min-h-screen bg-card flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <AlertTriangle className="h-10 w-10 text-rose-500" />
          <p className="text-lg font-medium text-foreground">
            {error || "Organization not found"}
          </p>
          <Link href="/organizations">
            <Button variant="outline">Back to Organizations</Button>
          </Link>
        </div>
      </div>
    );
  }

  const initial = organization.name.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-card">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Back Link */}
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Organizations
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-foreground flex items-center justify-center shrink-0">
            <span className="text-white text-2xl font-semibold">{initial}</span>
          </div>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-foreground">
              {organization.name}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>Created {formatDate(organization.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Store className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {outlets.length}
                </p>
                <p className="text-xs text-muted-foreground">Outlets</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <FileCheck className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {agreements.length}
                </p>
                <p className="text-xs text-muted-foreground">Agreements</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Bell className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {alerts.length}
                </p>
                <p className="text-xs text-muted-foreground">Reminders</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Outlets Section */}
        <Card>
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground">
                Outlets
              </CardTitle>
              <Link href="/agreements/upload">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-border"
                >
                  Add Outlet via Upload
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {outlets.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No outlets yet. Upload a lease agreement to create one.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">
                      Outlet
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">
                      City
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">
                      Property Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">
                      Model
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase text-right">
                      Area (sqft)
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">
                      Status
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outlets.map((outlet) => (
                    <TableRow
                      key={outlet.id}
                      className="hover:bg-muted"
                    >
                      <TableCell className="font-medium text-foreground">
                        {outlet.name}
                      </TableCell>
                      <TableCell className="text-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          {outlet.city}
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground">
                        {statusLabel(outlet.property_type || "")}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {outlet.franchise_model || "--"}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {outlet.super_area_sqft
                          ? outlet.super_area_sqft.toLocaleString("en-IN")
                          : "--"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${statusColor(outlet.status)} border-0 text-xs`}
                        >
                          {statusLabel(outlet.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/outlets/${outlet.id}`}>
                          <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Agreements Section */}
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-semibold text-foreground">
              Agreements
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {agreements.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No agreements yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">
                      Document
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">
                      Outlet
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase text-right">
                      Monthly Rent
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">
                      Expiry
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">
                      Status
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agreements.map((agr) => (
                    <TableRow key={agr.id} className="hover:bg-muted">
                      <TableCell className="font-medium text-foreground">
                        {agr.document_filename || "Untitled"}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {agr.outlets?.name || "--"}
                        {agr.outlets?.city ? `, ${agr.outlets.city}` : ""}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {statusLabel(agr.type)}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {formatCurrency(agr.monthly_rent)}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {formatDate(agr.lease_expiry_date)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${statusColor(agr.status)} border-0 text-xs`}
                        >
                          {statusLabel(agr.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/agreements/${agr.id}`}>
                          <ChevronRight className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        {alerts.length > 0 && (
          <Card>
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-foreground">
                  Recent Reminders
                </CardTitle>
                <Link href="/alerts">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-border"
                  >
                    View All Reminders
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between border border-border rounded-lg p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      className={`${severityColor(alert.severity)} border-0 text-xs`}
                    >
                      {alert.severity}
                    </Badge>
                    <span className="text-sm text-foreground">{alert.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(alert.trigger_date)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
