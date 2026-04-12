"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Loader2,
  RefreshCw,
  MapPin,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { listAgreements } from "@/lib/api";

type Agreement = {
  id: string;
  outlet_id: string;
  lessor_name: string | null;
  lessee_name: string | null;
  brand_name: string | null;
  lease_expiry_date: string | null;
  monthly_rent: number | null;
  security_deposit: number | null;
  renewal_status: string | null;
  status: string;
  outlets: { name: string; city: string } | null;
};

const RENEWAL_STAGES = [
  { value: "not_started", label: "Not Started", color: "bg-slate-100 text-slate-700" },
  { value: "under_review", label: "Under Review", color: "bg-muted text-foreground" },
  { value: "negotiation", label: "Negotiation", color: "bg-amber-100 text-amber-700" },
  { value: "approved", label: "Approved", color: "bg-emerald-100 text-emerald-700" },
  { value: "renewed", label: "Renewed", color: "bg-green-100 text-green-800" },
  { value: "not_renewing", label: "Not Renewing", color: "bg-rose-100 text-rose-700" },
];

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function urgencyBadge(days: number | null) {
  if (days === null) return <Badge variant="outline" className="text-[10px]">No expiry</Badge>;
  if (days < 0) return <Badge className="text-[10px] bg-rose-100 text-rose-700 border-0">Expired {Math.abs(days)}d ago</Badge>;
  if (days <= 30) return <Badge className="text-[10px] bg-rose-100 text-rose-700 border-0">{days}d left</Badge>;
  if (days <= 90) return <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0">{days}d left</Badge>;
  if (days <= 180) return <Badge className="text-[10px] bg-muted text-foreground border-0">{days}d left</Badge>;
  if (days <= 365) return <Badge variant="outline" className="text-[10px]">{days}d left</Badge>;
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">{Math.round(days / 365)}y+</Badge>;
}

function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function RenewalsPage() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const data = await listAgreements({ page: 1, page_size: 200 });
        const items = (data.items || []).filter(
          (a: Agreement) => a.status === "active" || a.status === "expiring"
        );
        // Deduplicate by outlet_id — keep only the latest agreement per outlet
        const byOutlet: Record<string, Agreement> = {};
        for (const a of items) {
          const key = a.outlet_id || a.id;
          if (!byOutlet[key] || (a.lease_expiry_date && (!byOutlet[key].lease_expiry_date || a.lease_expiry_date > byOutlet[key].lease_expiry_date))) {
            byOutlet[key] = a;
          }
        }
        // Sort by expiry date (soonest first)
        const deduped = Object.values(byOutlet).sort((a, b) => {
          if (!a.lease_expiry_date) return 1;
          if (!b.lease_expiry_date) return -1;
          return a.lease_expiry_date.localeCompare(b.lease_expiry_date);
        });
        setAgreements(deduped);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = filter === "all"
    ? agreements
    : filter === "expiring_soon"
      ? agreements.filter(a => { const d = daysUntil(a.lease_expiry_date); return d !== null && d >= 0 && d <= 180; })
      : filter === "expired"
        ? agreements.filter(a => { const d = daysUntil(a.lease_expiry_date); return d !== null && d < 0; })
        : agreements.filter(a => (a.renewal_status || "not_started") === filter);

  const expiringCount = agreements.filter(a => { const d = daysUntil(a.lease_expiry_date); return d !== null && d >= 0 && d <= 180; }).length;
  const expiredCount = agreements.filter(a => { const d = daysUntil(a.lease_expiry_date); return d !== null && d < 0; }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Licenses"
        description="Track licenses and renewal progress across your portfolio"
      >
        <Badge variant="secondary" className="bg-muted text-foreground font-medium">
          {agreements.length} leases
        </Badge>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setFilter("all")}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold">{agreements.length}</p>
            <p className="text-xs text-muted-foreground">Total Active</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:shadow-sm transition-shadow ${expiringCount > 0 ? "border-amber-200" : ""}`} onClick={() => setFilter("expiring_soon")}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-amber-600">{expiringCount}</p>
            <p className="text-xs text-muted-foreground">Expiring in 6 months</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:shadow-sm transition-shadow ${expiredCount > 0 ? "border-rose-200" : ""}`} onClick={() => setFilter("expired")}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-rose-600">{expiredCount}</p>
            <p className="text-xs text-muted-foreground">Expired</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setFilter("renewed")}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-emerald-600">{agreements.filter(a => a.renewal_status === "renewed").length}</p>
            <p className="text-xs text-muted-foreground">Renewed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "All" },
          { value: "expiring_soon", label: `Expiring Soon (${expiringCount})` },
          { value: "expired", label: `Expired (${expiredCount})` },
          ...RENEWAL_STAGES,
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              filter === f.value
                ? "bg-foreground text-white border-foreground"
                : "bg-white text-slate-600 border-slate-200 hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <RefreshCw className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No agreements match this filter</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilter("all")}>Show All</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="text-xs font-semibold uppercase">Outlet</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">City</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Lease Expiry</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Time Left</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-right">Monthly Rent</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Lessor</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Renewal Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((agr) => {
                  const days = daysUntil(agr.lease_expiry_date);
                  return (
                    <TableRow key={agr.id} className={`hover:bg-muted/50 ${days !== null && days < 0 ? "bg-rose-50/30" : days !== null && days <= 90 ? "bg-amber-50/30" : ""}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium">{agr.outlets?.name || agr.brand_name || "Unknown"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {agr.outlets?.city || "--"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {agr.lease_expiry_date
                          ? new Date(agr.lease_expiry_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : "--"}
                      </TableCell>
                      <TableCell>{urgencyBadge(days)}</TableCell>
                      <TableCell className="text-sm font-medium text-right tabular-nums">
                        {agr.monthly_rent ? formatCurrency(agr.monthly_rent) : "--"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {agr.lessor_name || "--"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={agr.renewal_status || "not_started"}
                          onValueChange={async (val) => {
                            try {
                              const { updateAgreement } = await import("@/lib/api");
                              await updateAgreement(agr.id, { field_updates: { "renewal_status": val } });
                              setAgreements(prev => prev.map(a => a.id === agr.id ? { ...a, renewal_status: val } : a));
                            } catch {
                              // Silently handle
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RENEWAL_STAGES.map(s => (
                              <SelectItem key={s.value} value={s.value}>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${s.color}`}>{s.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Link href={`/agreements/${agr.id}`}>
                          <Button variant="ghost" size="sm" className="text-xs h-7">View</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
