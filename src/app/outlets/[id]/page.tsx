"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  outlets,
  agreements,
  paymentRecords,
  alerts,
  formatCurrency,
  formatDate,
  daysUntil,
  statusColor,
  statusLabel,
} from "@/lib/mock-data";
import type { Agreement, PaymentRecord, Alert } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Building2,
  MapPin,
  IndianRupee,
  AlertTriangle,
  FileText,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Link as LinkIcon,
  Upload,
  ShieldAlert,
  CircleDot,
} from "lucide-react";

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
  return map[pt] || pt;
}

function agreementTypeLabel(t: string): string {
  const map: Record<string, string> = {
    lease_loi: "Lease / LOI",
    license_certificate: "License Certificate",
    franchise_agreement: "Franchise Agreement",
  };
  return map[t] || t;
}

function obligationLabel(t: string): string {
  const map: Record<string, string> = {
    rent: "Rent",
    cam: "CAM",
    hvac: "HVAC",
    electricity: "Electricity",
    security_deposit: "Security Deposit",
    cam_deposit: "CAM Deposit",
    license_renewal: "License Renewal",
  };
  return map[t] || t;
}

function rentToRevenueColor(ratio: number): string {
  if (ratio < 12) return "text-emerald-600";
  if (ratio <= 18) return "text-amber-600";
  return "text-red-600";
}

function rentToRevenueBg(ratio: number): string {
  if (ratio < 12) return "bg-emerald-50 border-emerald-200";
  if (ratio <= 18) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function severityIcon(severity: string) {
  if (severity === "high") return <XCircle className="h-4 w-4 text-red-500" />;
  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
}

// ---------------------------------------------------------------------------
// Timeline Component
// ---------------------------------------------------------------------------

type TimelineEvent = {
  label: string;
  date: string;
  iso: string;
  isPast: boolean;
};

function AgreementTimeline({ agreement }: { agreement: Agreement }) {
  const today = new Date("2026-02-22");

  const events: TimelineEvent[] = [];

  if (agreement.leaseCommencementDate) {
    events.push({
      label: "Lease Commencement",
      date: formatDate(agreement.leaseCommencementDate),
      iso: agreement.leaseCommencementDate,
      isPast: new Date(agreement.leaseCommencementDate) <= today,
    });
  }

  if (agreement.rentCommencementDate) {
    events.push({
      label: "Rent Commencement",
      date: formatDate(agreement.rentCommencementDate),
      iso: agreement.rentCommencementDate,
      isPast: new Date(agreement.rentCommencementDate) <= today,
    });
  }

  if (agreement.lockInEndDate) {
    events.push({
      label: "Lock-in Expiry",
      date: formatDate(agreement.lockInEndDate),
      iso: agreement.lockInEndDate,
      isPast: new Date(agreement.lockInEndDate) <= today,
    });
  }

  // Compute escalation dates
  if (
    agreement.escalationPct > 0 &&
    agreement.escalationFrequencyYears > 0 &&
    agreement.rentCommencementDate &&
    agreement.leaseExpiryDate
  ) {
    const rentStart = new Date(agreement.rentCommencementDate);
    const leaseEnd = new Date(agreement.leaseExpiryDate);
    let escDate = new Date(rentStart);
    escDate.setFullYear(
      escDate.getFullYear() + agreement.escalationFrequencyYears
    );
    let count = 1;
    while (escDate < leaseEnd) {
      events.push({
        label: `Escalation #${count} (${agreement.escalationPct}%)`,
        date: formatDate(escDate.toISOString().split("T")[0]),
        iso: escDate.toISOString().split("T")[0],
        isPast: escDate <= today,
      });
      escDate = new Date(escDate);
      escDate.setFullYear(
        escDate.getFullYear() + agreement.escalationFrequencyYears
      );
      count++;
    }
  }

  if (agreement.leaseExpiryDate) {
    events.push({
      label: "Lease Expiry",
      date: formatDate(agreement.leaseExpiryDate),
      iso: agreement.leaseExpiryDate,
      isPast: new Date(agreement.leaseExpiryDate) <= today,
    });
  }

  // Sort chronologically
  events.sort(
    (a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime()
  );

  if (events.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto">
      <div className="relative flex items-start min-w-[700px] py-4 px-2">
        {/* Horizontal line */}
        <div className="absolute top-[26px] left-4 right-4 h-0.5 bg-neutral-200" />
        {/* Progress line */}
        {(() => {
          const firstDate = new Date(events[0].iso).getTime();
          const lastDate = new Date(events[events.length - 1].iso).getTime();
          const todayTime = today.getTime();
          const pct = Math.min(
            100,
            Math.max(
              0,
              ((todayTime - firstDate) / (lastDate - firstDate)) * 100
            )
          );
          return (
            <div
              className="absolute top-[26px] left-4 h-0.5 bg-black"
              style={{ width: `calc(${pct}% - 16px)` }}
            />
          );
        })()}

        {events.map((ev, i) => (
          <div
            key={i}
            className="flex flex-col items-center flex-1 relative z-10"
          >
            <div
              className={`w-3 h-3 rounded-full border-2 ${
                ev.isPast
                  ? "bg-black border-black"
                  : "bg-white border-neutral-400"
              }`}
            />
            <span className="text-[11px] font-medium mt-2 text-center leading-tight text-neutral-900">
              {ev.label}
            </span>
            <span className="text-[10px] text-neutral-500 mt-0.5">
              {ev.date}
            </span>
            {!ev.isPast && (
              <span className="text-[10px] text-neutral-400 mt-0.5">
                {daysUntil(ev.iso) > 0
                  ? `${daysUntil(ev.iso)}d away`
                  : "Today"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function OutletDetailPage() {
  const params = useParams();
  const outletId = params.id as string;

  const outlet = outlets.find((o) => o.id === outletId);

  if (!outlet) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <h1 className="text-2xl font-semibold">Outlet not found</h1>
        <p className="text-neutral-500">
          No outlet with ID &quot;{outletId}&quot; exists.
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

  const outletAgreements: Agreement[] = agreements.filter(
    (a) => a.outletId === outletId
  );
  const outletPayments: PaymentRecord[] = paymentRecords.filter(
    (p) => p.outletId === outletId
  );
  const outletAlerts: Alert[] = alerts.filter(
    (a) => a.outletId === outletId
  );

  // Primary agreement for metrics (active or expiring, prefer active)
  const primaryAgreement =
    outletAgreements.find((a) => a.status === "active") ||
    outletAgreements.find((a) => a.status === "expiring") ||
    outletAgreements[0] ||
    null;

  const monthlyRent = primaryAgreement?.monthlyRent ?? 0;
  const camMonthly = primaryAgreement?.camMonthly ?? 0;
  const totalOutflow = primaryAgreement?.totalMonthlyOutflow ?? 0;
  const areaSqft = outlet.coveredAreaSqft;
  const rentPerSqft = primaryAgreement?.rentPerSqft ?? 0;

  const hasRevenue =
    outlet.monthlyNetRevenue !== null && outlet.monthlyNetRevenue > 0;
  const rentToRevenueRatio = hasRevenue
    ? (totalOutflow / outlet.monthlyNetRevenue!) * 100
    : null;

  // Risk flags from all agreements
  const allRiskFlags = outletAgreements.flatMap((a) =>
    a.riskFlags.map((rf) => ({ ...rf, agreementId: a.id, agreementType: a.type }))
  );

  // Total due this month
  const currentMonth = 2;
  const currentYear = 2026;
  const thisMonthPayments = outletPayments.filter(
    (p) => p.periodMonth === currentMonth && p.periodYear === currentYear
  );
  const totalDueThisMonth = thisMonthPayments.reduce(
    (sum, p) => sum + p.dueAmount,
    0
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
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
            <h1 className="text-2xl font-bold tracking-tight">
              {outlet.name}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
              <Building2 className="h-3.5 w-3.5" />
              <span>{outlet.brandName}</span>
              <span className="text-neutral-300">|</span>
              <MapPin className="h-3.5 w-3.5" />
              <span>
                {outlet.city}, {outlet.state}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge
                variant="outline"
                className={statusColor(outlet.status)}
              >
                {statusLabel(outlet.status)}
              </Badge>
              <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                {propertyTypeLabel(outlet.propertyType)}
              </Badge>
              <Badge variant="outline" className="border-neutral-200 text-neutral-700">
                {outlet.franchiseModel}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* METRICS ROW                                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Monthly Rent */}
        <Card className="border-neutral-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Monthly Rent
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-lg font-bold">
              {monthlyRent > 0 ? formatCurrency(monthlyRent) : "--"}
            </div>
          </CardContent>
        </Card>

        {/* CAM */}
        <Card className="border-neutral-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              CAM
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-lg font-bold">
              {camMonthly > 0 ? formatCurrency(camMonthly) : "--"}
            </div>
          </CardContent>
        </Card>

        {/* Total Outflow */}
        <Card className="border-neutral-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Total Outflow
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-lg font-bold">
              {totalOutflow > 0 ? formatCurrency(totalOutflow) : "--"}
            </div>
          </CardContent>
        </Card>

        {/* Area */}
        <Card className="border-neutral-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Area
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-lg font-bold">
              {areaSqft.toLocaleString("en-IN")} sqft
            </div>
          </CardContent>
        </Card>

        {/* Rent/sqft */}
        <Card className="border-neutral-200">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Rent / sqft
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-lg font-bold">
              {rentPerSqft > 0 ? `Rs ${rentPerSqft}` : "--"}
            </div>
          </CardContent>
        </Card>

        {/* Revenue */}
        <Card
          className={`border ${
            hasRevenue && rentToRevenueRatio !== null
              ? rentToRevenueBg(rentToRevenueRatio)
              : "border-neutral-200"
          }`}
        >
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {hasRevenue ? (
              <>
                <div className="text-lg font-bold">
                  {formatCurrency(outlet.monthlyNetRevenue!)}
                </div>
                {rentToRevenueRatio !== null && (
                  <div
                    className={`text-xs font-semibold mt-0.5 ${rentToRevenueColor(
                      rentToRevenueRatio
                    )}`}
                  >
                    {rentToRevenueRatio.toFixed(1)}% rent-to-revenue
                  </div>
                )}
              </>
            ) : (
              <div className="text-lg font-bold text-neutral-400">--</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* TABS                                                              */}
      {/* ----------------------------------------------------------------- */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-neutral-100">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agreements">Agreements</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* =============================================================== */}
        {/* OVERVIEW TAB                                                    */}
        {/* =============================================================== */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* Agreement Timeline */}
          {primaryAgreement && (
            <Card className="border-neutral-200">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Agreement Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AgreementTimeline agreement={primaryAgreement} />
                {/* Key dates summary below the timeline */}
                <Separator className="my-4" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
                  {primaryAgreement.leaseCommencementDate && (
                    <div>
                      <div className="text-neutral-500 text-xs">
                        Lease Commencement
                      </div>
                      <div className="font-medium">
                        {formatDate(primaryAgreement.leaseCommencementDate)}
                      </div>
                    </div>
                  )}
                  {primaryAgreement.rentCommencementDate && (
                    <div>
                      <div className="text-neutral-500 text-xs">
                        Rent Commencement
                      </div>
                      <div className="font-medium">
                        {formatDate(primaryAgreement.rentCommencementDate)}
                      </div>
                    </div>
                  )}
                  {primaryAgreement.lockInEndDate && (
                    <div>
                      <div className="text-neutral-500 text-xs">
                        Lock-in Expiry
                      </div>
                      <div className="font-medium">
                        {formatDate(primaryAgreement.lockInEndDate)}
                      </div>
                      <div className="text-xs text-neutral-400">
                        {daysUntil(primaryAgreement.lockInEndDate) > 0
                          ? `${daysUntil(primaryAgreement.lockInEndDate)} days away`
                          : "Expired"}
                      </div>
                    </div>
                  )}
                  {primaryAgreement.leaseExpiryDate && (
                    <div>
                      <div className="text-neutral-500 text-xs">
                        Lease Expiry
                      </div>
                      <div className="font-medium">
                        {formatDate(primaryAgreement.leaseExpiryDate)}
                      </div>
                      <div className="text-xs text-neutral-400">
                        {daysUntil(primaryAgreement.leaseExpiryDate) > 0
                          ? `${daysUntil(primaryAgreement.leaseExpiryDate)} days away`
                          : "Expired"}
                      </div>
                    </div>
                  )}
                  {primaryAgreement.escalationPct > 0 && (
                    <div>
                      <div className="text-neutral-500 text-xs">
                        Escalation
                      </div>
                      <div className="font-medium">
                        {primaryAgreement.escalationPct}% every{" "}
                        {primaryAgreement.escalationFrequencyYears} yr
                        {primaryAgreement.escalationFrequencyYears > 1
                          ? "s"
                          : ""}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {!primaryAgreement && (
            <Card className="border-neutral-200">
              <CardContent className="py-10 text-center text-neutral-500">
                No agreements linked to this outlet yet.
              </CardContent>
            </Card>
          )}

          {/* Active Risk Flags */}
          <Card className="border-neutral-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Active Risk Flags
                {allRiskFlags.length > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-2 bg-red-50 text-red-700 border-red-200"
                  >
                    {allRiskFlags.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allRiskFlags.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-neutral-500 py-4">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  No risk flags detected for this outlet.
                </div>
              ) : (
                <div className="space-y-3">
                  {allRiskFlags.map((rf, i) => (
                    <div
                      key={`${rf.agreementId}-${rf.id}-${i}`}
                      className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-100"
                    >
                      {severityIcon(rf.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {rf.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={statusColor(rf.severity)}
                          >
                            {statusLabel(rf.severity)}
                          </Badge>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">
                          {rf.explanation}
                        </p>
                        <p className="text-xs text-neutral-400 mt-1 italic">
                          &quot;{rf.clauseText}&quot;
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Alerts */}
          <Card className="border-neutral-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Upcoming Alerts
                {outletAlerts.length > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-2 bg-blue-50 text-blue-700 border-blue-200"
                  >
                    {outletAlerts.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {outletAlerts.length === 0 ? (
                <div className="text-sm text-neutral-500 py-4">
                  No alerts for this outlet.
                </div>
              ) : (
                <div className="space-y-3">
                  {outletAlerts.map((alert) => (
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
                          <span className="text-sm font-semibold">
                            {alert.title}
                          </span>
                          <Badge
                            variant="outline"
                            className={statusColor(alert.severity)}
                          >
                            {statusLabel(alert.severity)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={statusColor(alert.status)}
                          >
                            {statusLabel(alert.status)}
                          </Badge>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">
                          {alert.message}
                        </p>
                        <p className="text-xs text-neutral-400 mt-1">
                          Trigger: {formatDate(alert.triggerDate)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =============================================================== */}
        {/* AGREEMENTS TAB                                                  */}
        {/* =============================================================== */}
        <TabsContent value="agreements" className="space-y-4 mt-4">
          {outletAgreements.length === 0 ? (
            <Card className="border-neutral-200">
              <CardContent className="py-10 text-center text-neutral-500">
                No agreements linked to this outlet.
              </CardContent>
            </Card>
          ) : (
            outletAgreements.map((agr) => (
              <Card key={agr.id} className="border-neutral-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base">
                        {agreementTypeLabel(agr.type)}
                      </CardTitle>
                      <p className="text-xs text-neutral-500 mt-1">
                        {agr.id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={statusColor(agr.status)}
                      >
                        {statusLabel(agr.status)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={statusColor(agr.extractionStatus)}
                      >
                        {statusLabel(agr.extractionStatus)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Parties */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {agr.lessorName && (
                      <div>
                        <span className="text-neutral-500 text-xs">
                          Lessor
                        </span>
                        <div className="font-medium">{agr.lessorName}</div>
                      </div>
                    )}
                    <div>
                      <span className="text-neutral-500 text-xs">Lessee</span>
                      <div className="font-medium">{agr.lesseeName}</div>
                    </div>
                  </div>

                  <Separator />

                  {/* Key Dates */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    {agr.leaseCommencementDate && (
                      <div>
                        <span className="text-neutral-500 text-xs">
                          Lease Start
                        </span>
                        <div className="font-medium">
                          {formatDate(agr.leaseCommencementDate)}
                        </div>
                      </div>
                    )}
                    {agr.rentCommencementDate && (
                      <div>
                        <span className="text-neutral-500 text-xs">
                          Rent Start
                        </span>
                        <div className="font-medium">
                          {formatDate(agr.rentCommencementDate)}
                        </div>
                      </div>
                    )}
                    {agr.lockInEndDate && (
                      <div>
                        <span className="text-neutral-500 text-xs">
                          Lock-in End
                        </span>
                        <div className="font-medium">
                          {formatDate(agr.lockInEndDate)}
                        </div>
                      </div>
                    )}
                    <div>
                      <span className="text-neutral-500 text-xs">
                        Lease Expiry
                      </span>
                      <div className="font-medium">
                        {formatDate(agr.leaseExpiryDate)}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Monthly Amounts */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-neutral-500 text-xs">
                        Monthly Rent
                      </span>
                      <div className="font-medium">
                        {agr.monthlyRent > 0
                          ? formatCurrency(agr.monthlyRent)
                          : "--"}
                      </div>
                    </div>
                    <div>
                      <span className="text-neutral-500 text-xs">
                        Monthly CAM
                      </span>
                      <div className="font-medium">
                        {agr.camMonthly > 0
                          ? formatCurrency(agr.camMonthly)
                          : "--"}
                      </div>
                    </div>
                    <div>
                      <span className="text-neutral-500 text-xs">
                        Total Outflow
                      </span>
                      <div className="font-medium">
                        {agr.totalMonthlyOutflow > 0
                          ? formatCurrency(agr.totalMonthlyOutflow)
                          : "--"}
                      </div>
                    </div>
                    <div>
                      <span className="text-neutral-500 text-xs">
                        Security Deposit
                      </span>
                      <div className="font-medium">
                        {agr.securityDeposit > 0
                          ? formatCurrency(agr.securityDeposit)
                          : "--"}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Document */}
                  <div className="flex items-center gap-2 text-sm">
                    <LinkIcon className="h-4 w-4 text-neutral-400" />
                    <span className="text-neutral-500">Document:</span>
                    <span className="font-medium text-black hover:underline cursor-pointer">
                      {agr.documentFilename}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* =============================================================== */}
        {/* PAYMENTS TAB                                                    */}
        {/* =============================================================== */}
        <TabsContent value="payments" className="space-y-4 mt-4">
          {/* Monthly summary header */}
          <Card className="border-neutral-200">
            <CardContent className="py-4 px-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-neutral-500" />
                  <span className="text-sm font-semibold">
                    February 2026 -- Payments
                  </span>
                </div>
                <div className="text-sm">
                  Total due this month:{" "}
                  <span className="font-bold">
                    {formatCurrency(totalDueThisMonth)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {outletPayments.length === 0 ? (
            <Card className="border-neutral-200">
              <CardContent className="py-10 text-center text-neutral-500">
                No payment records for this outlet.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-neutral-200">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-100 bg-neutral-50">
                        <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Type
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Period
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Due Date
                        </th>
                        <th className="text-right py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Amount
                        </th>
                        <th className="text-center py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Status
                        </th>
                        <th className="text-right py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {outletPayments.map((payment) => {
                        const monthNames = [
                          "Jan",
                          "Feb",
                          "Mar",
                          "Apr",
                          "May",
                          "Jun",
                          "Jul",
                          "Aug",
                          "Sep",
                          "Oct",
                          "Nov",
                          "Dec",
                        ];
                        const periodLabel = `${
                          monthNames[payment.periodMonth - 1]
                        } ${payment.periodYear}`;
                        return (
                          <tr
                            key={payment.id}
                            className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <CircleDot className="h-3.5 w-3.5 text-neutral-400" />
                                <span className="font-medium">
                                  {obligationLabel(payment.type)}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-neutral-600">
                              {periodLabel}
                            </td>
                            <td className="py-3 px-4 text-neutral-600">
                              {formatDate(payment.dueDate)}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold">
                              {formatCurrency(payment.dueAmount)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Badge
                                variant="outline"
                                className={statusColor(payment.status)}
                              >
                                {statusLabel(payment.status)}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {payment.status !== "paid" ? (
                                <Button variant="outline" size="sm">
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                  Mark as Paid
                                </Button>
                              ) : (
                                <span className="text-xs text-neutral-400">
                                  Paid{" "}
                                  {payment.paidAt
                                    ? formatDate(payment.paidAt)
                                    : ""}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* =============================================================== */}
        {/* DOCUMENTS TAB                                                   */}
        {/* =============================================================== */}
        <TabsContent value="documents" className="space-y-4 mt-4">
          {outletAgreements.length === 0 ? (
            <Card className="border-neutral-200">
              <CardContent className="py-10 text-center text-neutral-500">
                No documents linked to this outlet.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-neutral-200">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-100 bg-neutral-50">
                        <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Filename
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Type
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Extraction Status
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Upload Date
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                          Agreement Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {outletAgreements.map((agr) => (
                        <tr
                          key={agr.id}
                          className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-neutral-400" />
                              <span className="font-medium hover:underline cursor-pointer">
                                {agr.documentFilename}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-neutral-600">
                            {agreementTypeLabel(agr.type)}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant="outline"
                              className={statusColor(agr.extractionStatus)}
                            >
                              {statusLabel(agr.extractionStatus)}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-neutral-600">
                            <div className="flex items-center gap-1.5">
                              <Upload className="h-3.5 w-3.5 text-neutral-400" />
                              {formatDate(agr.createdAt)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant="outline"
                              className={statusColor(agr.status)}
                            >
                              {statusLabel(agr.status)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
