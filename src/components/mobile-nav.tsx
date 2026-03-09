"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
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
  Kanban,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/lib/hooks/use-user";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "GroBot AI", href: "/ai-assistant", icon: Bot },
  { label: "Outlets", href: "/outlets", icon: Store },
  { label: "Agreements", href: "/agreements", icon: FileText },
  { label: "Upload Documents", href: "/agreements/upload", icon: FileText },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Pipeline", href: "/pipeline", icon: Kanban },
  { label: "Payments", href: "/payments", icon: Wallet },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Organizations", href: "/organizations", icon: Building2 },
];

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const roleLabels: Record<string, string> = {
  platform_admin: "Platform Admin",
  org_admin: "Org Admin",
  org_member: "Member",
};

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();

  function handleNavClick(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="p-4 border-b border-neutral-100">
          <SheetTitle className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="GroSpace" width={28} height={28} className="rounded-md" />
            <span className="text-[17px] font-semibold tracking-tight text-[#132337]">GroSpace</span>
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
                <button
                  key={item.href + item.label}
                  type="button"
                  onClick={() => handleNavClick(item.href)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left",
                    isActive
                      ? "bg-[#132337] text-white"
                      : "text-neutral-500 hover:text-[#132337] hover:bg-slate-50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-neutral-100 mt-auto">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full bg-[#132337] flex items-center justify-center">
              <span className="text-white text-[10px] font-semibold">
                {user?.initials || "??"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">
                {userLoading ? "Loading..." : user?.fullName || "User"}
              </p>
              <p className="text-[10px] text-neutral-400 truncate">
                {userLoading ? "" : roleLabels[user?.role || ""] || "Member"}
              </p>
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
