"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  IndianRupee,
  Trash2,
  Loader2,
} from "lucide-react";
import { listRentSchedule, deleteRentScheduleEntry } from "@/lib/api";

type RentEntry = {
  id: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  base_rent: number;
  rent_per_sqft: number | null;
  cam_monthly: number;
  hvac_monthly: number;
  insurance_monthly: number;
  taxes_monthly: number;
  gst_pct: number;
  revenue_share_pct: number | null;
  total_monthly_outflow: number;
  total_with_gst: number;
  is_current: boolean;
};

function formatINR(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

function formatDate(d: string | null): string {
  if (!d) return "-";
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

export function RentScheduleTable({ agreementId }: { agreementId: string }) {
  const [entries, setEntries] = useState<RentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listRentSchedule(agreementId);
      setEntries(data.rent_schedule || []);
      setError(null);
    } catch (e) {
      setError("Failed to load rent schedule");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [agreementId]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const handleDelete = async (entryId: string) => {
    try {
      await deleteRentScheduleEntry(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (e) {
      console.error("Failed to delete entry:", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading rent schedule...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return null; // Don't show empty state — rent data is in extracted fields
  }

  // Calculate totals
  const currentEntry = entries.find((e) => e.is_current);
  const totalLifetimeRent = entries.reduce(
    (sum, e) => sum + (e.total_monthly_outflow || 0) * 12,
    0
  );

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <IndianRupee className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Rent Schedule</span>
          <Badge variant="outline" className="text-[10px]">
            {entries.length} {entries.length === 1 ? "period" : "periods"}
          </Badge>
        </div>
        {currentEntry && (
          <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
            Current: {formatINR(currentEntry.base_rent)}/mo
          </Badge>
        )}
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="w-[100px]">Period</TableHead>
                <TableHead className="w-[90px]">From</TableHead>
                <TableHead className="w-[90px]">To</TableHead>
                <TableHead className="text-right">Base Rent</TableHead>
                <TableHead className="text-right">Per Sqft</TableHead>
                <TableHead className="text-right">CAM</TableHead>
                <TableHead className="text-right">Total/mo</TableHead>
                <TableHead className="text-right">With GST</TableHead>
                {entries.some((e) => e.revenue_share_pct) && (
                  <TableHead className="text-right">Rev Share</TableHead>
                )}
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  className={
                    entry.is_current
                      ? "bg-emerald-50 font-medium"
                      : "hover:bg-muted/50"
                  }
                >
                  <TableCell className="text-xs font-medium">
                    {entry.period_label}
                    {entry.is_current && (
                      <Badge
                        variant="outline"
                        className="ml-1.5 text-[9px] border-emerald-300 text-emerald-700"
                      >
                        Current
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(entry.period_start)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(entry.period_end)}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {formatINR(entry.base_rent)}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                    {entry.rent_per_sqft
                      ? `₹${entry.rent_per_sqft}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                    {entry.cam_monthly ? formatINR(entry.cam_monthly) : "-"}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-medium">
                    {formatINR(entry.total_monthly_outflow)}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {formatINR(entry.total_with_gst)}
                  </TableCell>
                  {entries.some((e) => e.revenue_share_pct) && (
                    <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                      {entry.revenue_share_pct
                        ? `${entry.revenue_share_pct}%`
                        : "-"}
                    </TableCell>
                  )}
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={() => handleDelete(entry.id)}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/30 text-xs">
          <span className="text-muted-foreground">
            Estimated annual rent liability
          </span>
          <span className="font-semibold tabular-nums">
            {formatINR(totalLifetimeRent / entries.length)}/year (avg)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
