"use client";

import {
  ArrowRight,
  FileCheck,
  Bell,
  Pencil,
  IndianRupee,
  Activity,
} from "lucide-react";

interface TimelineItem {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  user_name: string;
}

const ACTION_CONFIG: Record<
  string,
  { icon: typeof ArrowRight; label: string; color: string }
> = {
  status_changed: {
    icon: ArrowRight,
    label: "Status Changed",
    color: "bg-blue-100 text-blue-700",
  },
  revenue_updated: {
    icon: IndianRupee,
    label: "Revenue Updated",
    color: "bg-emerald-100 text-emerald-700",
  },
  confirm_and_activate: {
    icon: FileCheck,
    label: "Agreement Activated",
    color: "bg-purple-100 text-purple-700",
  },
  fields_edited: {
    icon: Pencil,
    label: "Fields Edited",
    color: "bg-amber-100 text-amber-700",
  },
  reminder_created: {
    icon: Bell,
    label: "Reminder Created",
    color: "bg-pink-100 text-pink-700",
  },
  reminder_updated: {
    icon: Bell,
    label: "Reminder Updated",
    color: "bg-pink-100 text-pink-700",
  },
  deal_stage_changed: {
    icon: ArrowRight,
    label: "Deal Stage Changed",
    color: "bg-indigo-100 text-indigo-700",
  },
};

function formatTimelineDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimelineTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatusLabel(s: string): string {
  return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderDetail(action: string, details: Record<string, unknown>) {
  switch (action) {
    case "status_changed":
      return (
        <span>
          {formatStatusLabel(details.old_status as string)}{" "}
          <span className="text-neutral-400 mx-1">&rarr;</span>{" "}
          {formatStatusLabel(details.new_status as string)}
        </span>
      );
    case "revenue_updated": {
      const fmt = (v: unknown) =>
        typeof v === "number"
          ? new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: "INR",
              maximumFractionDigits: 0,
            }).format(v)
          : "N/A";
      return (
        <span>
          {fmt(details.old_revenue)}{" "}
          <span className="text-neutral-400 mx-1">&rarr;</span>{" "}
          {fmt(details.new_revenue)}
        </span>
      );
    }
    case "confirm_and_activate":
      return (
        <span>
          {details.filename as string} &mdash; {details.obligations_created as number} obligations,{" "}
          {details.alerts_created as number} alerts
        </span>
      );
    case "fields_edited": {
      const fields = details.fields as string[];
      return <span>Updated: {fields?.join(", ") || "fields"}</span>;
    }
    case "reminder_created":
      return <span>{details.title as string}</span>;
    case "reminder_updated":
      return (
        <span>Updated: {(details.updated_fields as string[])?.join(", ")}</span>
      );
    case "deal_stage_changed":
      return (
        <span>
          {formatStatusLabel(details.old_stage as string)}{" "}
          <span className="text-neutral-400 mx-1">&rarr;</span>{" "}
          {formatStatusLabel(details.new_stage as string)}
        </span>
      );
    default:
      return <span>{JSON.stringify(details)}</span>;
  }
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-neutral-500 py-4 text-center">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-neutral-200" />

      <div className="space-y-4">
        {items.map((item) => {
          const config = ACTION_CONFIG[item.action] || {
            icon: Activity,
            label: item.action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            color: "bg-neutral-100 text-neutral-700",
          };
          const Icon = config.icon;

          return (
            <div key={item.id} className="relative flex gap-3 pl-1">
              {/* Icon circle */}
              <div
                className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${config.color}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{config.label}</span>
                  <span className="text-xs text-neutral-400">
                    {formatTimelineDate(item.created_at)} at{" "}
                    {formatTimelineTime(item.created_at)}
                  </span>
                </div>
                <div className="text-sm text-neutral-600 mt-0.5">
                  {renderDetail(item.action, item.details)}
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  by {item.user_name}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
