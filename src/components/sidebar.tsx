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
  ChevronDown,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    label: "Outlets",
    href: "/outlets",
    icon: Store,
    children: [
      { label: "All Outlets", href: "/outlets" },
    ],
  },
  {
    label: "Agreements",
    href: "/agreements",
    icon: FileText,
    children: [
      { label: "All Agreements", href: "/agreements" },
      { label: "Upload New", href: "/agreements/upload" },
    ],
  },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Payments", href: "/payments", icon: Wallet },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Outlets: true,
    Agreements: true,
  });

  return (
    <aside className="w-[240px] h-screen bg-white border-r border-neutral-100 flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-neutral-100">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">G</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">GroSpace</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.children && item.children.some((c) => pathname === c.href)) ||
              (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expanded[item.label];

            return (
              <div key={item.label}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-500 hover:text-black hover:bg-neutral-50"
                  )}
                  onClick={(e) => {
                    if (hasChildren) {
                      e.preventDefault();
                      setExpanded((prev) => ({
                        ...prev,
                        [item.label]: !prev[item.label],
                      }));
                    }
                  }}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1">{item.label}</span>
                  {hasChildren && (
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 transition-transform",
                        isExpanded && "rotate-180"
                      )}
                    />
                  )}
                </Link>
                {hasChildren && isExpanded && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {item.children!.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] transition-colors",
                          pathname === child.href
                            ? "text-black font-medium"
                            : "text-neutral-400 hover:text-black"
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
        <div className="mt-6 pt-4 border-t border-neutral-100">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
            Platform Admin
          </p>
          <Link
            href="/organizations"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname === "/organizations"
                ? "bg-neutral-900 text-white"
                : "text-neutral-500 hover:text-black hover:bg-neutral-50"
            )}
          >
            <Building2 className="w-4 h-4" />
            <span>Organizations</span>
          </Link>
        </div>
      </nav>

      {/* User */}
      <div className="p-3 border-t border-neutral-100">
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
    </aside>
  );
}
