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
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    operational: "bg-emerald-50 text-emerald-700",
    fit_out: "bg-blue-50 text-blue-700",
    expiring: "bg-amber-50 text-amber-700",
    up_for_renewal: "bg-amber-50 text-amber-700",
    expired: "bg-red-50 text-red-700",
    closed: "bg-neutral-100 text-neutral-500",
    draft: "bg-neutral-100 text-neutral-600",
    pipeline: "bg-violet-50 text-violet-700",
    pending: "bg-amber-50 text-amber-700",
  };
  return map[status] || "bg-neutral-100 text-neutral-600";
}

function statusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function severityColor(severity: string): string {
  const map: Record<string, string> = {
    high: "bg-red-50 text-red-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-blue-50 text-blue-700",
    info: "bg-neutral-50 text-neutral-600",
  };
  return map[severity] || "bg-neutral-100 text-neutral-600";
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-500">Loading organization...</p>
        </div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <AlertTriangle className="h-10 w-10 text-red-400" />
          <p className="text-lg font-medium text-neutral-800">
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
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Back Link */}
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-black transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Organizations
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-black flex items-center justify-center shrink-0">
            <span className="text-white text-2xl font-bold">{initial}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-black">
              {organization.name}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-neutral-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>Created {formatDate(organization.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center">
                <Store className="w-5 h-5 text-neutral-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-black">
                  {outlets.length}
                </p>
                <p className="text-xs text-neutral-500">Outlets</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center">
                <FileCheck className="w-5 h-5 text-neutral-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-black">
                  {agreements.length}
                </p>
                <p className="text-xs text-neutral-500">Agreements</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center">
                <Bell className="w-5 h-5 text-neutral-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-black">
                  {alerts.length}
                </p>
                <p className="text-xs text-neutral-500">Alerts</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Outlets Section */}
        <Card>
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-black">
                Outlets
              </CardTitle>
              <Link href="/agreements/upload">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-neutral-200"
                >
                  Add Outlet via Upload
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {outlets.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                No outlets yet. Upload a lease agreement to create one.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-neutral-50">
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase">
                      Outlet
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase">
                      City
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase">
                      Property Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase">
                      Model
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase text-right">
                      Area (sqft)
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase">
                      Status
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outlets.map((outlet) => (
                    <TableRow
                      key={outlet.id}
                      className="hover:bg-neutral-50"
                    >
                      <TableCell className="font-medium text-black">
                        {outlet.name}
                      </TableCell>
                      <TableCell className="text-neutral-600">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-neutral-400" />
                          {outlet.city}
                        </div>
                      </TableCell>
                      <TableCell className="text-neutral-600">
                        {statusLabel(outlet.property_type || "")}
                      </TableCell>
                      <TableCell className="text-neutral-600">
                        {outlet.franchise_model || "--"}
                      </TableCell>
                      <TableCell className="text-right text-neutral-600">
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
                          <ChevronRight className="w-4 h-4 text-neutral-400 hover:text-black" />
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
            <CardTitle className="text-base font-semibold text-black">
              Agreements
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {agreements.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                No agreements yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-neutral-50">
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase">
                      Document
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase">
                      Outlet
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase text-right">
                      Monthly Rent
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase">
                      Expiry
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-neutral-500 uppercase">
                      Status
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agreements.map((agr) => (
                    <TableRow key={agr.id} className="hover:bg-neutral-50">
                      <TableCell className="font-medium text-black">
                        {agr.document_filename || "Untitled"}
                      </TableCell>
                      <TableCell className="text-neutral-600">
                        {agr.outlets?.name || "--"}
                        {agr.outlets?.city ? `, ${agr.outlets.city}` : ""}
                      </TableCell>
                      <TableCell className="text-neutral-600">
                        {statusLabel(agr.type)}
                      </TableCell>
                      <TableCell className="text-right text-neutral-600">
                        {formatCurrency(agr.monthly_rent)}
                      </TableCell>
                      <TableCell className="text-neutral-600">
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
                          <ChevronRight className="w-4 h-4 text-neutral-400 hover:text-black" />
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
                <CardTitle className="text-base font-semibold text-black">
                  Recent Alerts
                </CardTitle>
                <Link href="/alerts">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-neutral-200"
                  >
                    View All Alerts
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between border border-neutral-100 rounded-lg p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      className={`${severityColor(alert.severity)} border-0 text-xs`}
                    >
                      {alert.severity}
                    </Badge>
                    <span className="text-sm text-black">{alert.title}</span>
                  </div>
                  <span className="text-xs text-neutral-500">
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
