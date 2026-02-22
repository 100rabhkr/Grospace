"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Upload,
  FileText,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  agreements,
  formatCurrency,
  formatDate,
  statusColor,
  statusLabel,
} from "@/lib/mock-data";
import type { AgreementType } from "@/lib/mock-data";

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

export default function AgreementsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [extractionFilter, setExtractionFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return agreements.filter((agr) => {
      const matchesSearch =
        searchQuery === "" ||
        agr.documentFilename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agr.outletName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agr.lessorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agr.lesseeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agr.brandName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = typeFilter === "all" || agr.type === typeFilter;
      const matchesStatus = statusFilter === "all" || agr.status === statusFilter;
      const matchesExtraction =
        extractionFilter === "all" || agr.extractionStatus === extractionFilter;

      return matchesSearch && matchesType && matchesStatus && matchesExtraction;
    });
  }, [searchQuery, typeFilter, statusFilter, extractionFilter]);

  function riskDotColor(count: number, flags: { severity: string }[]) {
    if (count === 0) return "bg-emerald-500";
    const hasHigh = flags.some((f) => f.severity === "high");
    return hasHigh ? "bg-red-500" : "bg-amber-500";
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Agreements</h1>
            <Badge variant="secondary" className="text-sm font-medium">
              {agreements.length}
            </Badge>
          </div>
          <Link href="/agreements/upload">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Agreement
            </Button>
          </Link>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3">
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

          <Select value={extractionFilter} onValueChange={setExtractionFilter}>
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

        {/* Table */}
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
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
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                    No agreements match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((agr) => (
                  <TableRow key={agr.id} className="group">
                    <TableCell>
                      <Link
                        href={`/agreements/${agr.id}`}
                        className="flex items-center gap-2 font-medium text-black hover:underline"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate max-w-[180px]">
                          {agr.documentFilename}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/agreements/${agr.id}`}
                        className="text-sm hover:underline"
                      >
                        {agr.outletName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs font-medium whitespace-nowrap"
                      >
                        {typeLabels[agr.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${statusColor(agr.status)} border-0 text-xs font-medium`}
                      >
                        {statusLabel(agr.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {agr.lessorName || "--"}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(agr.leaseExpiryDate)}
                    </TableCell>
                    <TableCell className="text-sm text-right whitespace-nowrap">
                      {agr.monthlyRent > 0
                        ? formatCurrency(agr.monthlyRent)
                        : "--"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-flex items-center gap-1.5 cursor-default">
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${riskDotColor(
                                agr.riskFlags.length,
                                agr.riskFlags
                              )}`}
                            />
                            <span className="text-sm font-medium">
                              {agr.riskFlags.length}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px]">
                          {agr.riskFlags.length === 0 ? (
                            <p>No risk flags detected</p>
                          ) : (
                            <div className="space-y-1">
                              {agr.riskFlags.map((flag) => (
                                <p key={flag.id} className="text-xs">
                                  <span
                                    className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${
                                      flag.severity === "high"
                                        ? "bg-red-400"
                                        : "bg-amber-400"
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
                      <Badge
                        className={`${statusColor(agr.extractionStatus)} border-0 text-xs font-medium`}
                      >
                        {extractionLabels[agr.extractionStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/agreements/${agr.id}`}>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}
