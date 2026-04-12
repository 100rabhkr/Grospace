"use client";

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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function MobileNavItem({
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
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-left text-[13px] font-semibold tracking-tight transition-colors duration-150",
        active
          ? "bg-primary text-primary-foreground"
          : "text-[#3c4257] hover:bg-white/70 hover:text-foreground"
      )}
    >
      <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={active ? 2 : 1.75} />
      <span className="flex-1 truncate">{item.label}</span>
    </button>
  );
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();

  const userRole: UserRole = user?.role || "org_member";
  const navSectionsForUser = getNavSectionsForRole(userRole);
  const availableQuickActions = userRole === "platform_admin"
    ? []
    : quickActions.filter((item) => hasAccess(userRole, item.minRole));

  function handleNavClick(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[272px] border-none bg-[#f2f3fd] p-0"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="px-5 pb-3 pt-5">
            <SheetTitle asChild>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Logo className="h-5 w-5" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="truncate text-[16px] font-bold tracking-tight text-foreground leading-tight">
                    GroSpace
                  </p>
                  <p className="truncate text-[11px] font-semibold text-muted-foreground leading-tight">
                    Enterprise Admin
                  </p>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>

          {availableQuickActions.length > 0 && (
            <div className="space-y-1.5 px-5 pb-3">
              {availableQuickActions.map((item, idx) => {
                const Icon = item.icon;
                const isPrimary = idx === 0;
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => handleNavClick(item.href)}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[12.5px] font-semibold tracking-tight transition-colors duration-200",
                      isPrimary
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-white text-foreground ring-1 ring-border/50 hover:bg-white/70"
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                    <span>{`+ ${item.label}`}</span>
                  </button>
                );
              })}
            </div>
          )}

          <nav className="flex-1 overflow-y-auto px-2.5 pb-2">
            <div className="space-y-2">
              {navSectionsForUser.map((section) => {
                const visibleItems = section.items.filter((item) => hasAccess(userRole, item.minRole));
                if (visibleItems.length === 0) return null;

                return (
                  <div key={section.label}>
                    <p className="mb-1 px-3.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {section.label}
                    </p>
                    <div className="space-y-1">
                      {visibleItems.map((item) => (
                        <MobileNavItem
                          key={item.href}
                          item={item}
                          active={isNavItemActive(pathname, item)}
                          onClick={() => handleNavClick(item.href)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="px-4 pb-4 pt-2">
            <div className="flex items-center gap-2 rounded-xl bg-white/60 px-2 py-2 ring-1 ring-border/30">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary">
                <span className="text-[10px] font-semibold text-white">
                  {userLoading ? "..." : user?.initials || "??"}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-foreground leading-tight">
                  {userLoading ? "Loading..." : user?.fullName || "User"}
                </p>
                <p className="truncate text-[10px] font-medium text-muted-foreground leading-tight">
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
                className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={1.7} />
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
