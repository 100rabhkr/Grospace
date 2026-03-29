"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Building2,
  IndianRupee,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { listAgreements } from "@/lib/api";

type Agreement = {
  id: string;
  lessor_name: string | null;
  lessee_name: string | null;
  brand_name: string | null;
  lease_expiry_date: string | null;
  monthly_rent: number | null;
  renewal_status: string | null;
  status: string;
  outlets: { name: string; city: string } | null;
};

const KANBAN_STAGES = [
  { key: "not_started", label: "Not Started", color: "bg-slate-100 text-slate-700" },
  { key: "option_decision", label: "Option Decision", color: "bg-blue-100 text-blue-700" },
  { key: "exercise", label: "Exercise", color: "bg-indigo-100 text-indigo-700" },
  { key: "negotiation", label: "Negotiation", color: "bg-amber-100 text-amber-700" },
  { key: "execution", label: "Execution", color: "bg-emerald-100 text-emerald-700" },
  { key: "complete", label: "Complete", color: "bg-green-100 text-green-800" },
];

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

function urgencyBadge(days: number | null) {
  if (days === null) return null;
  if (days < 0) return <Badge variant="outline" className="text-[9px] border-slate-300 text-slate-500">Expired</Badge>;
  if (days <= 30) return <Badge className="text-[9px] bg-rose-100 text-rose-700 border-0">{days}d left</Badge>;
  if (days <= 90) return <Badge className="text-[9px] bg-amber-100 text-amber-700 border-0">{days}d left</Badge>;
  if (days <= 180) return <Badge className="text-[9px] bg-blue-100 text-blue-700 border-0">{days}d left</Badge>;
  return <Badge variant="outline" className="text-[9px]">{days}d</Badge>;
}

export default function RenewalsPage() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await listAgreements();
        const items = (data.agreements || []).filter(
          (a: Agreement) => a.status === "active" || a.status === "expiring"
        );
        setAgreements(items);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group agreements by renewal_status
  const byStage: Record<string, Agreement[]> = {};
  for (const stage of KANBAN_STAGES) {
    byStage[stage.key] = [];
  }
  for (const agr of agreements) {
    const stage = agr.renewal_status || "not_started";
    if (byStage[stage]) {
      byStage[stage].push(agr);
    } else {
      byStage["not_started"].push(agr);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lease Renewals"
        description="Track renewal progress across your portfolio"
      />

      {agreements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <RefreshCw className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No active agreements to renew</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {KANBAN_STAGES.map((stage) => (
            <div key={stage.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {stage.label}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {byStage[stage.key].length}
                </Badge>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {byStage[stage.key].map((agr) => {
                  const days = daysUntil(agr.lease_expiry_date);
                  return (
                    <Link key={agr.id} href={`/agreements/${agr.id}`}>
                      <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="text-xs font-medium truncate">
                                {agr.outlets?.name || agr.brand_name || "Unknown"}
                              </span>
                            </div>
                            {urgencyBadge(days)}
                          </div>
                          {agr.outlets?.city && (
                            <p className="text-[10px] text-muted-foreground">{agr.outlets.city}</p>
                          )}
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Calendar className="h-2.5 w-2.5" />
                              {agr.lease_expiry_date
                                ? new Date(agr.lease_expiry_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
                                : "No expiry"}
                            </span>
                            {agr.monthly_rent && (
                              <span className="flex items-center gap-0.5 font-medium tabular-nums">
                                <IndianRupee className="h-2.5 w-2.5" />
                                {Number(agr.monthly_rent).toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
