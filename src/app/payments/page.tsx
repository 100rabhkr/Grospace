"use client";

import { useState, useEffect, useMemo } from "react";
import { listPayments, updatePayment, generatePayments } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  ChevronDown,
  Loader2,
  X,
  CalendarDays,
} from "lucide-react";

// ---------- Types ----------

type Payment = {
  id: string;
  org_id: string;
  obligation_id: string;
  outlet_id: string;
  period_month: number;
  period_year: number;
  due_date: string;
  due_amount: number | null;
  status: string;
  paid_amount: number | null;
  paid_at: string | null;
  notes: string | null;
  obligations: { type: string; frequency: string; amount: number | null } | null;
  outlets: { name: string; city: string } | null;
};

// ---------- Helpers ----------

function formatCurrency(amount: number): string {
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

function statusColor(status: string): string {
  const map: Record<string, string> = {
    upcoming: "bg-blue-100 text-blue-800",
    due: "bg-amber-100 text-amber-800",
    paid: "bg-emerald-100 text-emerald-800",
    overdue: "bg-red-100 text-red-800",
    partially_paid: "bg-orange-100 text-orange-800",
  };
  return map[status] || "bg-neutral-100 text-neutral-600";
}

function statusLabel(s: string): string {
  return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function obligationTypeLabel(type: string): string {
  const map: Record<string, string> = {
    rent: "Rent",
    cam: "CAM",
    hvac: "HVAC",
    electricity: "Electricity",
    water_gas: "Water/Gas",
    power_backup: "Power Backup",
    security_deposit: "Security Deposit",
    cam_deposit: "CAM Deposit",
    utility_deposit: "Utility Deposit",
    revenue_reconciliation: "Revenue Recon",
    license_renewal: "License Renewal",
  };
  return map[type] || statusLabel(type);
}

function monthName(month: number): string {
  return new Date(2024, month - 1, 1).toLocaleString("en-IN", { month: "short" });
}

// ---------- Component ----------

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [outletFilter, setOutletFilter] = useState<string>("all");

  // ---------- Fetch ----------

  async function fetchPayments() {
    try {
      setLoading(true);
      setError(null);
      const data = await listPayments();
      setPayments(data.payments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPayments();
  }, []);

  // ---------- Generate Payments ----------

  async function handleGenerate() {
    try {
      setGenerating(true);
      const result = await generatePayments(3);
      if (result.created > 0) {
        await fetchPayments();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate payments");
    } finally {
      setGenerating(false);
    }
  }

  // ---------- Update Payment Status ----------

  async function handleMarkPaid(paymentId: string, dueAmount: number | null) {
    try {
      setUpdatingId(paymentId);
      await updatePayment(paymentId, {
        status: "paid",
        paid_amount: dueAmount || undefined,
      });
      setPayments((prev) =>
        prev.map((p) =>
          p.id === paymentId
            ? { ...p, status: "paid", paid_amount: dueAmount, paid_at: new Date().toISOString() }
            : p
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update payment");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleMarkOverdue(paymentId: string) {
    try {
      setUpdatingId(paymentId);
      await updatePayment(paymentId, { status: "overdue" });
      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, status: "overdue" } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update payment");
    } finally {
      setUpdatingId(null);
    }
  }

  // ---------- Filter logic ----------

  const uniqueOutlets = useMemo(() => {
    const outlets = new Map<string, string>();
    payments.forEach((p) => {
      if (p.outlets?.name) outlets.set(p.outlet_id, p.outlets.name);
    });
    return Array.from(outlets.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [payments]);

  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    payments.forEach((p) => {
      if (p.obligations?.type) types.add(p.obligations.type);
    });
    return Array.from(types).sort();
  }, [payments]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (typeFilter !== "all" && p.obligations?.type !== typeFilter) return false;
      if (outletFilter !== "all" && p.outlet_id !== outletFilter) return false;
      return true;
    });
  }, [payments, statusFilter, typeFilter, outletFilter]);

  // ---------- Aggregates ----------

  const totalDue = filteredPayments
    .filter((p) => p.status === "due" || p.status === "overdue")
    .reduce((s, p) => s + (p.due_amount || 0), 0);
  const totalPaid = filteredPayments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + (p.paid_amount || p.due_amount || 0), 0);
  const totalOverdue = filteredPayments
    .filter((p) => p.status === "overdue")
    .reduce((s, p) => s + (p.due_amount || 0), 0);
  const upcomingCount = filteredPayments.filter((p) => p.status === "upcoming").length;

  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all" || outletFilter !== "all";

  function clearFilters() {
    setStatusFilter("all");
    setTypeFilter("all");
    setOutletFilter("all");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-neutral-700" />
          <h1 className="text-2xl font-bold tracking-tight text-black">Payments</h1>
          {!loading && (
            <Badge variant="secondary" className="text-sm">
              {payments.length}
            </Badge>
          )}
        </div>
        <Button onClick={handleGenerate} disabled={generating} variant="outline">
          {generating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {generating ? "Generating..." : "Generate Payments"}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-red-200 bg-red-50 text-red-800">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm flex-1">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Due + Overdue</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(totalDue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Paid</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totalPaid)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Overdue</p>
              <p className={`text-2xl font-bold mt-1 ${totalOverdue > 0 ? "text-red-700" : ""}`}>
                {formatCurrency(totalOverdue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Upcoming</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{upcomingCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="due">Due</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="partially_paid">Partially Paid</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue placeholder="Obligation Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {uniqueTypes.map((t) => (
                  <SelectItem key={t} value={t}>{obligationTypeLabel(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={outletFilter} onValueChange={setOutletFilter}>
              <SelectTrigger><SelectValue placeholder="Outlet" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outlets</SelectItem>
                {uniqueOutlets.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="self-end h-9">
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading payments...</p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && payments.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Wallet className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-1">No payment records yet</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Click &quot;Generate Payments&quot; to create payment records from your active obligations.
            </p>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Generate Payments
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      {!loading && filteredPayments.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-neutral-50/80">
                    <TableHead className="whitespace-nowrap">Outlet</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="whitespace-nowrap">Period</TableHead>
                    <TableHead className="whitespace-nowrap">Due Date</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Amount</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Paid</TableHead>
                    <TableHead className="whitespace-nowrap">Paid At</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id} className="text-sm">
                      <TableCell className="whitespace-nowrap">
                        <div>
                          <p className="font-medium">{payment.outlets?.name || "--"}</p>
                          <p className="text-xs text-muted-foreground">{payment.outlets?.city || ""}</p>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {obligationTypeLabel(payment.obligations?.type || "")}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {monthName(payment.period_month)} {payment.period_year}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatDate(payment.due_date)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {payment.due_amount != null ? formatCurrency(payment.due_amount) : "--"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className={`${statusColor(payment.status)} border-0 text-[11px]`}>
                          {statusLabel(payment.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {payment.paid_amount != null ? formatCurrency(payment.paid_amount) : "--"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {payment.paid_at ? formatDate(payment.paid_at) : "--"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {payment.status !== "paid" && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={updatingId === payment.id}
                              onClick={() => handleMarkPaid(payment.id, payment.due_amount)}
                            >
                              {updatingId === payment.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              )}
                              Paid
                            </Button>
                            {payment.status !== "overdue" && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 text-xs">
                                    <ChevronDown className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleMarkOverdue(payment.id)}>
                                    <Clock className="h-3.5 w-3.5 mr-2" />
                                    Mark Overdue
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        )}
                        {payment.status === "paid" && (
                          <span className="text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" />
                            Paid
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
