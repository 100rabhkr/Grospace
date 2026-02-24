"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  FileText,
  Bell,
  Wallet,
  BarChart3,
  Settings,
  Building2,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Outlets", href: "/outlets", icon: Store },
  { label: "Agreements", href: "/agreements", icon: FileText },
  { label: "Upload Agreement", href: "/agreements/upload", icon: FileText },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Payments", href: "/payments", icon: Wallet },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Organizations", href: "/organizations", icon: Building2 },
];

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="p-4 border-b border-neutral-100">
          <SheetTitle className="flex items-center gap-2">
            <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">G</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">GroSpace</span>
          </SheetTitle>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href + item.label}
                  href={item.href}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-500 hover:text-black hover:bg-neutral-50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-neutral-100 mt-auto">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center">
              <span className="text-white text-[10px] font-semibold">SS</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">Srabhjot Singh</p>
              <p className="text-[10px] text-neutral-400 truncate">Platform Admin</p>
            </div>
            <button
              onClick={() => {
                fetch("/api/auth/signout", { method: "POST" }).then(() => {
                  window.location.href = "/auth/login";
                });
              }}
              className="text-neutral-400 hover:text-black transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
