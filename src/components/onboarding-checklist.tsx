"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Upload,
  CheckCircle2,
  Circle,
  Bell,
  Users,
  FileCheck,
  X,
  Rocket,
} from "lucide-react";

interface OnboardingChecklistProps {
  totalAgreements: number;
  hasConfirmedExtraction: boolean;
  orgMemberCount: number;
}

const DISMISSED_KEY = "grospace-onboarding-dismissed";
const ALERTS_VISITED_KEY = "grospace-alerts-visited";

export function OnboardingChecklist({
  totalAgreements,
  hasConfirmedExtraction,
  orgMemberCount,
}: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash
  const [alertsVisited, setAlertsVisited] = useState(false);

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISSED_KEY) === "true";
    const wasAlertsVisited = localStorage.getItem(ALERTS_VISITED_KEY) === "true";
    setDismissed(wasDismissed);
    setAlertsVisited(wasAlertsVisited);
  }, []);

  // Don't show if dismissed or org has >= 2 agreements (past onboarding)
  if (dismissed || totalAgreements >= 2) return null;

  const steps = [
    {
      label: "Upload your first lease",
      done: totalAgreements >= 1,
      href: "/agreements/upload",
      icon: Upload,
    },
    {
      label: "Review extracted data",
      done: hasConfirmedExtraction,
      href: "/agreements",
      icon: FileCheck,
    },
    {
      label: "Check your alerts",
      done: alertsVisited,
      href: "/alerts",
      icon: Bell,
      onClick: () => {
        localStorage.setItem(ALERTS_VISITED_KEY, "true");
        setAlertsVisited(true);
      },
    },
    {
      label: "Invite a team member",
      done: orgMemberCount >= 2,
      href: "/settings",
      icon: Users,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progressPct = (completedCount / steps.length) * 100;

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  return (
    <Card className="border-[#e4e8ef] bg-gradient-to-r from-[#fafbfd] to-white overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#132337] flex items-center justify-center">
              <Rocket className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#132337]">
                Get started with GroSpace
              </h3>
              <p className="text-[11px] text-neutral-500">
                {completedCount}/{steps.length} steps complete
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded hover:bg-[#f4f6f9] transition-colors text-neutral-400 hover:text-neutral-600"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-[#e4e8ef] mb-4 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#132337] transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-2.5">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Link
                key={step.label}
                href={step.href}
                onClick={step.onClick}
                className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200 ${
                  step.done
                    ? "border-emerald-200 bg-emerald-50/50 opacity-70"
                    : "border-[#e4e8ef] bg-white hover:border-[#132337]/20 hover:shadow-sm"
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-neutral-300 flex-shrink-0" />
                )}
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${step.done ? "text-emerald-500" : "text-neutral-400"}`} />
                <span
                  className={`text-sm ${
                    step.done
                      ? "text-emerald-700 line-through"
                      : "text-[#132337] font-medium"
                  }`}
                >
                  {step.label}
                </span>
              </Link>
            );
          })}
        </div>

        {completedCount === steps.length && (
          <div className="mt-4 pt-3 border-t border-[#e4e8ef] text-center">
            <p className="text-sm text-emerald-700 font-medium">
              All done! You&apos;re all set.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="mt-1 text-xs text-neutral-500"
            >
              Dismiss checklist
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
