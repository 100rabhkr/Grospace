"use client";

/**
 * KpiCard — the single metric tile used across the dashboard.
 *
 * Design rules:
 *  - Monochrome body, semantic delta color ONLY when appropriate
 *  - Number animates on mount via <Counter />
 *  - Label is text-micro (uppercase, 11px)
 *  - Hover lifts the card 2px with a subtle shadow upgrade
 *  - Click target opens the related detail page
 */

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Counter } from "@/components/motion";

type Trend = "up" | "down" | "flat";

export interface KpiCardProps {
  label: string;
  value: number;
  format?: (v: number) => string;
  /** Optional tiny sublabel below the number, e.g. "vs last month" */
  sublabel?: string;
  /** Optional delta string like "+12.4%" — color follows `trend` */
  delta?: string;
  trend?: Trend;
  /** Icon shown in the top-right tile */
  icon?: LucideIcon;
  /** If provided, the entire card becomes a Link to this href */
  href?: string;
  className?: string;
}

export function KpiCard({
  label,
  value,
  format,
  sublabel,
  delta,
  trend = "flat",
  icon: Icon,
  href,
  className,
}: KpiCardProps) {
  const deltaColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
      ? "text-destructive"
      : "text-muted-foreground";

  const body = (
    <div
      className={cn(
        "group relative h-full overflow-hidden rounded-xl border border-border bg-card p-4",
        "transition-all duration-base ease-out-quint",
        href && "hover:border-border-strong cursor-pointer",
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-micro">{label}</span>
        {Icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-foreground/70 transition-colors group-hover:bg-foreground group-hover:text-background">
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[26px] font-semibold tracking-tight leading-none text-foreground tabular-nums">
            <Counter value={value} format={format} />
          </div>
          {sublabel && (
            <p className="mt-1.5 text-[11px] text-muted-foreground truncate">
              {sublabel}
            </p>
          )}
        </div>

        {delta && (
          <span
            className={cn(
              "text-[11px] font-semibold tabular-nums whitespace-nowrap",
              deltaColor
            )}
          >
            {delta}
          </span>
        )}
      </div>

      {href && (
        <ArrowUpRight
          className="absolute right-4 bottom-4 h-3 w-3 text-muted-foreground opacity-0 transition-opacity duration-base group-hover:opacity-100"
          strokeWidth={2}
        />
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }
  return body;
}

/* ────────────────────────────────────────────────
 * Secondary: KpiStat — smaller inline variant
 * Used inside cards that show multiple related metrics
 * ──────────────────────────────────────────────── */
export function KpiStat({
  label,
  value,
  format,
  trend = "flat",
  delta,
  className,
}: {
  label: string;
  value: number;
  format?: (v: number) => string;
  trend?: Trend;
  delta?: string;
  className?: string;
}) {
  const deltaColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-micro">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-metric-sm text-foreground">
          <Counter value={value} format={format} />
        </span>
        {delta && (
          <span className={cn("text-caption font-semibold", deltaColor)}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
