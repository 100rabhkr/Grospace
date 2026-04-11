"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useUser } from "@/lib/hooks/use-user";
import {
  getNavSectionsForRole,
  hasAccess,
  isNavItemActive,
  quickActions,
  roleLabels,
  type NavItem,
  type UserRole,
} from "@/components/navigation-config";

/* ────────────────────────────────────────────────
 * Sidebar — static (no scroll), widened
 *
 * All sections stack vertically and must fit without scroll.
 * If a future section makes it overflow, tighten spacing here.
 * ──────────────────────────────────────────────── */

function SidebarNavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      title={item.description}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-lg px-3 py-[7px] text-left",
        "text-[13px] font-medium tracking-tight transition-all duration-fast ease-out-quint will-change-transform",
        active
          ? "bg-foreground text-background"
          : "text-foreground/80 hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-[16px] w-[16px] shrink-0" strokeWidth={active ? 2.1 : 1.75} />
      <span className="flex-1 truncate">{item.label}</span>
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();

  const userRole: UserRole = user?.role || "org_member";
  // Super Admin gets a platform-level sidebar; everyone else gets the
  // regular org-scoped nav. Quick actions ("+ Add Outlet", "+ Upload Docs")
  // are org operations, so Super Admin doesn't see them either.
  const navSectionsForUser = getNavSectionsForRole(userRole);
  const availableQuickActions = userRole === "platform_admin"
    ? []
    : quickActions.filter((item) => hasAccess(userRole, item.minRole));

  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col overflow-hidden border-r border-border bg-background">
      {/* Brand */}
      <div className="px-4 pt-5 pb-3 shrink-0">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-transform duration-base ease-out-quint group-hover:scale-[0.96]">
            <Logo className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold leading-tight tracking-tight text-foreground">
              GroSpace
            </div>
            <p className="text-[10px] font-medium leading-tight text-muted-foreground">
              Lease Intelligence
            </p>
          </div>
        </Link>
      </div>

      {/* Quick Actions */}
      {availableQuickActions.length > 0 && (
        <div className="space-y-1.5 px-4 pb-3 shrink-0">
          {availableQuickActions.map((item, idx) => {
            const Icon = item.icon;
            const isPrimary = idx === 0;
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => router.push(item.href)}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg py-2",
                  "text-[12.5px] font-semibold tracking-tight",
                  "transition-all duration-fast ease-out-quint active:scale-[0.97] will-change-transform",
                  isPrimary
                    ? "bg-foreground text-background elevation-1 hover:bg-foreground/90"
                    : "border border-border bg-background text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                <span>{`+ ${item.label}`}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Navigation — all sections inline, no scroll */}
      <nav className="flex-1 min-h-0 overflow-hidden px-2.5 pb-2">
        <div className="space-y-2.5">
          {navSectionsForUser.map((section) => {
            const visibleItems = section.items.filter((item) => hasAccess(userRole, item.minRole));
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.label}>
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <SidebarNavButton
                      key={item.href}
                      item={item}
                      active={isNavItemActive(pathname, item)}
                      onClick={() => router.push(item.href)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <span className="text-[10px] font-semibold">
              {userLoading ? "..." : user?.initials || "??"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-foreground leading-tight">
              {userLoading ? "Loading..." : user?.fullName || "User"}
            </p>
            <p className="truncate text-[11px] font-medium text-muted-foreground leading-tight">
              {userLoading ? "" : roleLabels[user?.role || ""] || "Member"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              fetch("/api/auth/signout", { method: "POST" }).then(() => {
                window.location.href = "/auth/login";
              });
            }}
            className="rounded-md p-1.5 text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-destructive"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  );
}
