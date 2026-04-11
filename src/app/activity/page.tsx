"use client";

import Link from "next/link";
import { useUser } from "@/lib/hooks/use-user";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, ExternalLink, ArrowLeft } from "lucide-react";

/**
 * Super Admin cross-org activity viewer.
 *
 * This is a placeholder — the real activity stream lives in Google Sheets
 * (each org has its own tab named "<OrgName> (<last-4-uuid>)"). The
 * platform_admin nav links here so there's a clear entry point when the
 * full in-app viewer ships; for now it just points at the sheet + the
 * per-org activity tab on each organization's detail page.
 */
export default function PlatformActivityPage() {
  const { user } = useUser();
  const isSuperAdmin = user?.role === "platform_admin";

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <p className="text-sm text-muted-foreground">
          This page is only visible to platform administrators.
        </p>
        <Link href="/">
          <Button variant="outline" size="sm">Back to dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1000px]">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Platform Activity
        </h1>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Cross-organization audit trail. Every action any user takes in any
          customer org is mirrored to Google Sheets per-org for full visibility.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Where activity lives</h2>
            <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
              Every organization has its own tab in the shared GroSpace Google
              Sheet. The tab is named
              {" "}
              <code className="text-[11.5px] font-mono bg-muted px-1.5 py-0.5 rounded">
                &lt;Org Name&gt; (&lt;last-4-uuid&gt;)
              </code>
              {" "}
              and captures every outlet creation, agreement upload, event,
              reminder, payment, deletion, member invite, and login attempt
              for that customer.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-[11.5px] font-semibold text-foreground">What you can do right now</p>
            <ul className="text-[11.5px] text-muted-foreground mt-2 space-y-1.5 list-disc list-inside">
              <li>Open the shared Google Sheet in a new tab to read any org&apos;s activity</li>
              <li>Click any organization from the Platform Overview or Organizations list to see their recent alerts inline</li>
              <li>Use Gro AI (Cmd+K) to ask cross-org questions like &quot;which orgs added outlets this week?&quot;</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Link href="/organizations">
              <Button size="sm" variant="outline" className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                View Organizations
              </Button>
            </Link>
            <a
              href={process.env.NEXT_PUBLIC_ACTIVITY_SHEET_URL || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={!process.env.NEXT_PUBLIC_ACTIVITY_SHEET_URL ? "pointer-events-none opacity-50" : ""}
            >
              <Button size="sm" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Open Google Sheet
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
