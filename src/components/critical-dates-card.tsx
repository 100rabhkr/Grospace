"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Bell,
  Lock,
  IndianRupee,
  FileText,
  Key,
} from "lucide-react";
import { listCriticalDates, updateCriticalDateStatus } from "@/lib/api";

type CriticalDate = {
  id: string;
  date_type: string;
  date_value: string;
  label: string;
  status: string;
  days_remaining: number;
  notes: string | null;
};

const typeIcons: Record<string, React.ElementType> = {
  lease_expiry: Calendar,
  notice_deadline: Bell,
  lock_in_end: Lock,
  escalation_due: IndianRupee,
  security_deposit_refund: Key,
  rent_commencement: Clock,
  fit_out_end: FileText,
  option_exercise: CheckCircle2,
  renewal_window_open: Calendar,
  renewal_window_close: Calendar,
  registration_due: FileText,
  custom: Calendar,
};

function urgencyColor(days: number): string {
  if (days < 0) return "text-slate-400";
  if (days <= 14) return "text-rose-600";
  if (days <= 30) return "text-rose-500";
  if (days <= 60) return "text-amber-600";
  if (days <= 90) return "text-amber-500";
  return "text-emerald-600";
}

function urgencyBg(days: number): string {
  if (days < 0) return "bg-slate-50";
  if (days <= 30) return "bg-rose-50";
  if (days <= 90) return "bg-amber-50";
  return "bg-emerald-50";
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export function CriticalDatesCard({ agreementId }: { agreementId: string }) {
  const [dates, setDates] = useState<CriticalDate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDates = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listCriticalDates(agreementId);
      setDates(data.critical_dates || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [agreementId]);

  useEffect(() => {
    fetchDates();
  }, [fetchDates]);

  const handleAcknowledge = async (id: string) => {
    try {
      await updateCriticalDateStatus(id, "acknowledged");
      setDates((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "acknowledged" } : d))
      );
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading critical dates...</span>
      </div>
    );
  }

  if (dates.length === 0) return null;

  const upcoming = dates.filter((d) => d.days_remaining >= 0 && d.status === "upcoming");
  const nextCritical = upcoming[0];

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Critical Dates</span>
          <Badge variant="outline" className="text-[10px]">
            {upcoming.length} upcoming
          </Badge>
        </div>
        {nextCritical && (
          <Badge className={`text-[10px] ${urgencyBg(nextCritical.days_remaining)} ${urgencyColor(nextCritical.days_remaining)} border-0`}>
            Next: {nextCritical.days_remaining}d
          </Badge>
        )}
      </div>
      <CardContent className="p-0">
        <div className="divide-y">
          {dates.map((entry) => {
            const Icon = typeIcons[entry.date_type] || Calendar;
            const isOverdue = entry.days_remaining < 0;
            const isAcknowledged = entry.status === "acknowledged" || entry.status === "actioned";

            return (
              <div
                key={entry.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${isOverdue ? "opacity-50" : ""} ${isAcknowledged ? "opacity-60" : ""}`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${urgencyColor(entry.days_remaining)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{entry.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(entry.date_value)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isOverdue && !isAcknowledged && (
                    <span className={`text-xs font-semibold tabular-nums ${urgencyColor(entry.days_remaining)}`}>
                      {entry.days_remaining}d
                    </span>
                  )}
                  {isOverdue && (
                    <Badge variant="outline" className="text-[9px] text-slate-500">
                      Passed
                    </Badge>
                  )}
                  {isAcknowledged ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : !isOverdue ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => handleAcknowledge(entry.id)}
                    >
                      Ack
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
