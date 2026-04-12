"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Upload,
  FileText,
  ChevronRight,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, statusTone } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { listAgreements, deleteAgreement } from "@/lib/api";
import { useUser } from "@/lib/hooks/use-user";
import { canWrite, type UserRole } from "@/components/navigation-config";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";

// --- Types ---

type AgreementType = "lease_loi" | "license_certificate" | "franchise_agreement";

type RiskFlag = {
  id?: number;
  flag_id?: number;
  name: string;
  severity: "high" | "medium";
  explanation: string;
  clause_text?: string;
};

type OutletInfo = {
  name: string;
  city: string;
  address: string;
  property_type: string;
  status: string;
};

type Agreement = {
  id: string;
  org_id: string;
  outlet_id: string;
  type: AgreementType;
  status: string;
  document_filename: string;
  extracted_data: Record<string, unknown> | null;
  extraction_status: string;
  risk_flags: RiskFlag[];
  lessor_name: string | null;
  lessee_name: string | null;
  brand_name: string | null;
  lease_commencement_date: string | null;
  lease_expiry_date: string | null;
  monthly_rent: number | null;
  cam_monthly: number | null;
  total_monthly_outflow: number | null;
  security_deposit: number | null;
  confirmed_at: string | null;
  created_at: string;
  outlets: OutletInfo | null;
};

// --- Helpers ---

const typeLabels: Record<AgreementType, string> = {
  lease_loi: "Lease / LOI",
  license_certificate: "License",
  franchise_agreement: "Franchise",
};

const extractionLabels: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  review: "In Review",
  confirmed: "Confirmed",
  failed: "Failed",
};

function statusLabel(status: string): string {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `Rs ${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `Rs ${(amount / 100000).toFixed(2)} L`;
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// --- Loading Skeleton ---

function TableSkeleton() {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted hover:bg-muted">
            <TableHead className="w-[220px]">Document</TableHead>
            <TableHead>Outlet</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Lessor</TableHead>
            <TableHead>Lease Expiry</TableHead>
            <TableHead className="text-right">Monthly Rent</TableHead>
            <TableHead className="text-center">Risk Flags</TableHead>
            <TableHead>Extraction</TableHead>
            <TableHead className="w-[40px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 9 }).map((_, j) => (
                <TableCell key={j}>
                  <div className="h-4 bg-border rounded animate-pulse w-full max-w-[120px]" />
                </TableCell>
              ))}
              <TableCell>
                <div className="h-4 w-4 bg-border rounded animate-pulse" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Page ---

export default function AgreementsPage() {
  const { user } = useUser();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [extractionFilter, setExtractionFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;

    async function fetchAgreements() {
      try {
        setLoading(true);
        setError(null);
        const data = await listAgreements({ page, page_size: pageSize });
        if (!cancelled) {
          setAgreements(data.items || []);
          setTotal(data.total || 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load agreements"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAgreements();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const filtered = useMemo(() => {
    return agreements.filter((agr) => {
      const outletName = agr.outlets?.name || "";
      const matchesSearch =
        searchQuery === "" ||
        (agr.document_filename || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        outletName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (agr.lessor_name || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        (agr.lessee_name || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        (agr.brand_name || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase());

      const matchesType = typeFilter === "all" || agr.type === typeFilter;
      const matchesStatus =
        statusFilter === "all" || agr.status === statusFilter;
      const matchesExtraction =
        extractionFilter === "all" ||
        agr.extraction_status === extractionFilter;

      return matchesSearch && matchesType && matchesStatus && matchesExtraction;
    });
  }, [agreements, searchQuery, typeFilter, statusFilter, extractionFilter]);

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <PageHeader title="Agreements">
          {!loading && (
            <Badge variant="secondary" className="text-sm font-medium">
              {total}
            </Badge>
          )}
          {canWrite(user?.role as UserRole | undefined) && (
            <Link href="/agreements/upload">
              <Button className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Documents
              </Button>
            </Link>
          )}
        </PageHeader>

        {/* Error State */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-700">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                Failed to load agreements
              </p>
              <p className="text-sm">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="w-full flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by document, outlet, lessor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="lease_loi">Lease / LOI</SelectItem>
              <SelectItem value="license_certificate">License</SelectItem>
              <SelectItem value="franchise_agreement">Franchise</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expiring">Expiring</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="renewed">Renewed</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={extractionFilter}
            onValueChange={setExtractionFilter}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Extraction Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Extraction</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="review">In Review</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading Skeleton */}
        {loading && <TableSkeleton />}

        {/* Empty State (not loading, no error, no agreements at all) */}
        {!loading && !error && agreements.length === 0 && (
          <div className="rounded-lg border bg-card flex flex-col items-center justify-center py-20">
            <FileText className="h-12 w-12 text-[#d1d5db] mb-4" />
            <h2 className="text-lg font-semibold mb-1">No agreements yet</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Upload your first agreement to get started with Gro AI-powered
              extraction.
            </p>
            <Link href="/agreements/upload">
              <Button className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Documents
              </Button>
            </Link>
          </div>
        )}

        {/* Table — premium row layout */}
        {!loading && !error && agreements.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden elevation-1">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[240px]">Document</TableHead>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lessor</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Monthly Rent</TableHead>
                  <TableHead className="text-right">Risks</TableHead>
                  <TableHead>Extraction</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                      No agreements match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((agr) => {
                    const outletName = agr.outlets?.name || "Unknown Outlet";
                    const riskFlags = agr.risk_flags || [];

                    return (
                      <TableRow key={agr.id} className="group h-12 cursor-pointer">
                        <TableCell>
                          <Link
                            href={`/agreements/${agr.id}`}
                            className="flex items-center gap-2.5 group-hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" strokeWidth={1.75} />
                            <span className="truncate max-w-[180px] text-[13px] font-semibold text-foreground">
                              {agr.document_filename}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/agreements/${agr.id}`}
                            className="text-[13px] text-muted-foreground hover:text-foreground hover:underline truncate block max-w-[160px]"
                          >
                            {outletName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="whitespace-nowrap">
                            {typeLabels[agr.type] || statusLabel(agr.type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={statusTone(agr.status)}>
                            {statusLabel(agr.status)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground truncate max-w-[160px]">
                          {agr.lessor_name || "—"}
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatDate(agr.lease_expiry_date)}
                        </TableCell>
                        <TableCell className="text-right text-[13px] font-semibold text-foreground tabular-nums whitespace-nowrap">
                          {agr.monthly_rent && agr.monthly_rent > 0
                            ? formatCurrency(agr.monthly_rent)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex items-center gap-1.5 cursor-default">
                                <span
                                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                                    riskFlags.length === 0
                                      ? "bg-foreground/20"
                                      : riskFlags.some((f) => f.severity === "high")
                                      ? "bg-destructive"
                                      : "bg-warning"
                                  }`}
                                />
                                <span className="text-[13px] font-semibold tabular-nums">
                                  {riskFlags.length}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[260px]">
                              {riskFlags.length === 0 ? (
                                <p>No risk flags detected</p>
                              ) : (
                                <div className="space-y-1">
                                  {riskFlags.map((flag, idx) => (
                                    <p key={flag.id || flag.flag_id || idx} className="text-xs">
                                      <span
                                        className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${
                                          flag.severity === "high"
                                            ? "bg-destructive"
                                            : "bg-warning"
                                        }`}
                                      />
                                      {flag.name}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={statusTone(agr.extraction_status)}>
                            {extractionLabels[agr.extraction_status] ||
                              statusLabel(agr.extraction_status)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* Delete button is org_admin+ only. org_member and
                                finance_viewer see no trash icon. Backend is
                                also gated — this is UX defence in depth. */}
                            {canWrite(user?.role as UserRole | undefined) && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (!confirm(`Move "${agr.document_filename}" to the recycle bin? You can restore it later from Settings → Recycle Bin.`)) return;
                                  try {
                                    await deleteAgreement(agr.id);
                                    setAgreements((prev) => prev.filter((a) => a.id !== agr.id));
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : "Failed to delete");
                                  }
                                }}
                                className="p-1 rounded text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete (move to recycle bin)"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <Link href={`/agreements/${agr.id}`}>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && (
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        )}
      </div>
    </TooltipProvider>
  );
}
