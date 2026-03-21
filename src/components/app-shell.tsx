"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";
import { initGlobalErrorHandlers } from "@/lib/sentry";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");
  const isPublicPage = pathname?.startsWith("/showcase") || pathname?.startsWith("/leasebot");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Attach global error handlers for Sentry (once)
  useEffect(() => { initGlobalErrorHandlers(); }, []);

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
