"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: string;
  eyebrow?: string;
  children?: React.ReactNode;
  showBack?: boolean;
}

/* ────────────────────────────────────────────────
 * PageHeader — compact executive header.
 *
 *  - Title 22px h2 (not h1 — we already have TopBar label)
 *  - Description sits inline to the right or below on mobile
 *  - Actions align right
 *  - Bottom margin: 20px (mb-5) — dense but breathable
 * ──────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  eyebrow,
  children,
  showBack = true,
}: PageHeaderProps) {
  const router = useRouter();

  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-2.5 min-w-0">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 mt-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => router.back()}
            aria-label="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          </Button>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="text-micro mb-1">{eyebrow}</p>}
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-[12.5px] text-muted-foreground mt-1 max-w-3xl leading-snug">
              {description}
            </p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0">{children}</div>
      )}
    </div>
  );
}
