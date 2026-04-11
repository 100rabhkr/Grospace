import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * StatusBadge — the ONE component for every status pill across the app.
 *
 * Monochrome base with semantic dots — the text is never colored, the dot is.
 * This keeps the UI calm. Color is a signal, not decoration.
 *
 *   <StatusBadge tone="success">Active</StatusBadge>
 *   <StatusBadge tone="warning">Expiring</StatusBadge>
 *   <StatusBadge tone="danger">Expired</StatusBadge>
 *   <StatusBadge tone="neutral">Draft</StatusBadge>
 */

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const DOT_BY_TONE: Record<Tone, string> = {
  neutral: "bg-foreground/40",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-foreground",
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** If true, omit the leading dot (used in dense tables) */
  bare?: boolean;
}

export function StatusBadge({
  tone = "neutral",
  bare = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50",
        "px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground/90",
        className
      )}
      {...props}
    >
      {!bare && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", DOT_BY_TONE[tone])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

/* Helper: map domain statuses to tones so every page stays consistent */
export function statusTone(status: string | null | undefined): Tone {
  if (!status) return "neutral";
  const s = status.toLowerCase();
  if (["active", "operational", "confirmed", "renewed", "paid"].includes(s)) return "success";
  if (["expiring", "expiring_soon", "up_for_renewal", "review", "pending", "due", "fit_out", "warning"].includes(s)) return "warning";
  if (["expired", "terminated", "failed", "closed", "overdue", "danger"].includes(s)) return "danger";
  if (["processing", "in_progress", "info"].includes(s)) return "info";
  return "neutral";
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
