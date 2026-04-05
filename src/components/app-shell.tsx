"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";
import { Button } from "@/components/ui/button";
import { initGlobalErrorHandlers } from "@/lib/sentry";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");
  const isPublicPage = pathname?.startsWith("/showcase") || pathname?.startsWith("/leasebot");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pendingJobs, setPendingJobs] = useState<{id: string; filename: string; status: string}[]>([]);

  // Attach global error handlers for Sentry (once)
  useEffect(() => { initGlobalErrorHandlers(); }, []);

  // Check for completed extraction jobs on mount
  useEffect(() => {
    async function checkPendingJobs() {
      try {
        const { listExtractionJobs } = await import("@/lib/api");
        const data = await listExtractionJobs({ status: "completed" });
        const unseen = (data.jobs || []).filter((j: Record<string, unknown>) => !j.seen && j.result);
        setPendingJobs(unseen);
      } catch {
        // Silently ignore — non-critical
      }
    }
    checkPendingJobs();
  }, []);

  async function dismissJobs() {
    try {
      const api = await import("@/lib/api");
      for (const job of pendingJobs) {
        try {
          await api.markExtractionJobSeen(job.id);
        } catch {
          // Continue marking others
        }
      }
    } catch {
      // Silently ignore
    }
    setPendingJobs([]);
  }

  if (isAuthPage || isPublicPage) {
    return <>{children}</>;
  }

  const isMapPage = pathname === "/map";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile nav sheet */}
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />

        {pendingJobs.length > 0 && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm text-emerald-800">
                  <strong>{pendingJobs.length}</strong> document{pendingJobs.length > 1 ? "s" : ""} finished processing
                </span>
              </div>
              <button onClick={dismissJobs} className="text-xs text-emerald-600 hover:text-emerald-800 px-2">
                Dismiss
              </button>
            </div>
            <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-hide pb-1">
              {pendingJobs.map((job) => (
                <Link key={job.id} href={`/agreements/upload?job_id=${job.id}`} onClick={dismissJobs}>
                  <Button size="sm" variant="outline" className="text-xs h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-100 gap-1">
                    {(job as Record<string, unknown>).filename as string || "Document"}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        )}

        <main className={isMapPage
          ? "flex-1 overflow-hidden bg-background"
          : "flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8"
        }>
          {children}
        </main>
      </div>
    </div>
  );
}
