"use client";

import Link from "next/link";
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
  ChevronRight,
  LogOut,
  Kanban,
  Bot,
  Map,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useUser } from "@/lib/hooks/use-user";

type UserRole = "platform_admin" | "org_admin" | "org_member";

interface NavChild {
  label: string;
  href: string;
  minRole?: UserRole;
}

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  minRole?: UserRole;
  children?: NavChild[];
}

const ROLE_RANK: Record<UserRole, number> = {
  platform_admin: 3,
  org_admin: 2,
  org_member: 1,
};

function hasAccess(userRole: UserRole, minRole?: UserRole): boolean {
  if (!minRole) return true;
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Map View", href: "/map", icon: Map },
  { label: "Grow AI", href: "/ai-assistant", icon: Bot },
  {
    label: "Outlets",
    href: "/outlets",
    icon: Store,
    children: [
      { label: "All Outlets", href: "/outlets" },
      { label: "Create Outlet", href: "/outlets?create=true", minRole: "org_admin" },
    ],
  },
  {
    label: "Agreements",
    href: "/agreements",
    icon: FileText,
    children: [
      { label: "All Agreements", href: "/agreements" },
      { label: "Draft Review", href: "/agreements/upload", minRole: "org_admin" },
    ],
  },
  { label: "Reminders", href: "/alerts", icon: Bell },
  { label: "Pipeline", href: "/pipeline", icon: Kanban, minRole: "org_admin" },
  { label: "Renewals", href: "/renewals", icon: RefreshCw, minRole: "org_admin" },
  { label: "Payments", href: "/payments", icon: Wallet },
  { label: "Lease AI", href: "/leasebot", icon: Sparkles },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings, minRole: "org_admin" },
];

const roleLabels: Record<string, string> = {
  platform_admin: "Platform Admin",
  org_admin: "Org Admin",
  org_member: "Member",
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Outlets: true,
    Agreements: true,
  });

  const userRole: UserRole = user?.role || "org_member";

  return (
    <aside className="w-[232px] h-screen bg-white border-r border-slate-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-slate-200/60">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="GroSpace" width={24} height={24} className="rounded-md" />
          <span className="text-[14px] font-semibold tracking-tight text-slate-900">GroSpace</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        <div className="space-y-0.5">
          {navItems.filter((item) => hasAccess(userRole, item.minRole)).map((item) => {
            const isActive =
              pathname === item.href ||
              (item.children && item.children.some((c) => pathname === c.href)) ||
              (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            const visibleChildren = item.children?.filter((c) => hasAccess(userRole, c.minRole));
            const hasChildren = visibleChildren && visibleChildren.length > 0;
            const isExpanded = expanded[item.label];

            return (
              <div key={item.label}>
                <div
                  className={cn(
                    "relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  )}
                  onClick={() => {
                    router.push(item.href);
                    if (hasChildren) {
                      setExpanded((prev) => ({
                        ...prev,
                        [item.label]: !prev[item.label],
                      }));
                    }
                  }}
                >
                  <Icon className="w-[15px] h-[15px] shrink-0" strokeWidth={1.5} />
                  <span className="flex-1">{item.label}</span>
                  {hasChildren && (
                    <ChevronRight
                      className={cn(
                        "w-3 h-3 transition-transform duration-200",
                        isExpanded && "rotate-90"
                      )}
                      strokeWidth={1.5}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded((prev) => ({
                          ...prev,
                          [item.label]: !prev[item.label],
                        }));
                      }}
                    />
                  )}
                </div>
                {hasChildren && isExpanded && (
                  <div className="ml-[30px] mt-0.5 space-y-0.5">
                    {visibleChildren!.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex items-center px-2.5 py-[5px] rounded-md text-[12px] transition-colors duration-150",
                          pathname === child.href
                            ? "text-slate-900 font-medium"
                            : "text-slate-400 hover:text-slate-700"
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Platform Admin section */}
        {hasAccess(userRole, "platform_admin") && (
          <div className="mt-6 pt-4 border-t border-slate-200/60">
            <p className="px-2.5 mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Admin
            </p>
            <Link
              href="/organizations"
              className={cn(
                "relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-200",
                pathname === "/organizations"
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <Building2 className="w-[15px] h-[15px]" strokeWidth={1.5} />
              <span>Organizations</span>
            </Link>
          </div>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-slate-200/60">
        <div className="flex items-center gap-2.5 px-2">
          <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
            {userLoading ? (
              <span className="text-white text-[9px] font-medium font-mono">...</span>
            ) : (
              <span className="text-white text-[9px] font-semibold font-mono">
                {user?.initials || "??"}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium truncate text-slate-900">
              {userLoading ? "Loading..." : user?.fullName || "User"}
            </p>
            <p className="text-[10px] text-slate-400 truncate">
              {userLoading ? "" : roleLabels[user?.role || ""] || "Member"}
            </p>
          </div>
          <button
            onClick={() => {
              fetch("/api/auth/signout", { method: "POST" }).then(() => {
                window.location.href = "/auth/login";
              });
            }}
            className="text-slate-400 hover:text-slate-700 transition-colors duration-200 p-1.5 rounded-md hover:bg-slate-50"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </aside>
  );
}
