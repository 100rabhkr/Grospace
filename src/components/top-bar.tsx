"use client";

import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { alerts, formatDate } from "@/lib/mock-data";

export function TopBar() {
  const unreadCount = alerts.filter(
    (a) => a.status === "sent" || a.status === "pending"
  ).length;

  return (
    <header className="h-14 bg-white border-b border-neutral-100 flex items-center justify-between px-8 shrink-0">
      {/* Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input
            placeholder="Search outlets, agreements, alerts..."
            className="pl-9 h-9 text-sm bg-neutral-50 border-neutral-200 focus:bg-white"
          />
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Notification Bell */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] h-[18px]">
                  {unreadCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] p-0">
            <SheetHeader className="p-4 border-b">
              <SheetTitle className="text-base font-semibold">Notifications</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto max-h-[calc(100vh-80px)]">
              {/* Today */}
              <div className="px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                  Today
                </p>
                {alerts
                  .filter((a) => a.triggerDate === "2026-02-22")
                  .map((alert) => (
                    <div
                      key={alert.id}
                      className="py-3 border-b border-neutral-100 last:border-0"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                            alert.severity === "high"
                              ? "bg-red-500"
                              : alert.severity === "medium"
                              ? "bg-amber-500"
                              : "bg-blue-500"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{alert.title}</p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {alert.outletName}
                          </p>
                          <p className="text-xs text-neutral-400 mt-1">
                            {alert.message}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <Link href="/alerts">
                              <Button variant="outline" size="sm" className="h-7 text-xs">
                                View in Alerts
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
              {/* Earlier */}
              <div className="px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                  Earlier
                </p>
                {alerts
                  .filter((a) => a.triggerDate !== "2026-02-22")
                  .slice(0, 5)
                  .map((alert) => (
                    <div
                      key={alert.id}
                      className="py-3 border-b border-neutral-100 last:border-0"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                            alert.severity === "high"
                              ? "bg-red-500"
                              : alert.severity === "medium"
                              ? "bg-amber-500"
                              : "bg-blue-500"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{alert.title}</p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {alert.outletName} &middot; {formatDate(alert.triggerDate)}
                          </p>
                          <p className="text-xs text-neutral-400 mt-1">
                            {alert.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
