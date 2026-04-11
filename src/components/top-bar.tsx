"use client";

import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/components/notification-center";
import { findNavItem, getNavSectionsForRole } from "@/components/navigation-config";
import { useUser } from "@/lib/hooks/use-user";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TopBarProps {
  onMenuClick?: () => void;
}

/* ────────────────────────────────────────────────
 * TopBar — thin, quiet, breadcrumb style
 *  - Functional search button (opens a simple nav picker dialog)
 *  - Cmd/Ctrl + K global hotkey
 *  - No decorative icon/kbd clutter
 * ──────────────────────────────────────────────── */

export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const currentNav = findNavItem(pathname ?? "/");
  const navSectionsForUser = getNavSectionsForRole(user?.role);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Global hotkey: ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Flat list of all nav items for the search index (role-aware so
  // Super Admin's Cmd+K index doesn't include org-scoped pages they
  // don't have sidebar access to anyway)
  const allItems = navSectionsForUser.flatMap((s) =>
    s.items.map((i) => ({ ...i, section: s.label }))
  );

  const filtered = query.trim()
    ? allItems.filter((i) =>
        (i.label + " " + i.description + " " + i.section)
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
    : allItems;

  const handleSelect = useCallback(
    (href: string) => {
      setSearchOpen(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  return (
    <>
      <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between gap-4 px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={onMenuClick}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" strokeWidth={1.8} />
            </Button>

            <div className="min-w-0 flex items-center gap-2">
              <span className="text-[13px] font-semibold tracking-tight text-foreground truncate">
                {currentNav?.label || "Dashboard"}
              </span>
              {currentNav?.description && (
                <>
                  <span className="hidden md:inline text-muted-foreground/40">·</span>
                  <span className="hidden truncate text-[12px] text-muted-foreground md:block">
                    {currentNav.description}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden md:flex items-center h-8 rounded-md border border-border bg-background px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-w-[180px]"
              aria-label="Search"
            >
              <span>Search…</span>
            </button>
            <NotificationCenter />
          </div>
        </div>
      </header>

      {/* Search picker */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Search</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, sections, or type a label…"
            className="w-full h-12 px-5 text-[14px] font-medium text-foreground placeholder:text-muted-foreground bg-transparent border-b border-border focus:outline-none"
          />
          <div className="max-h-[320px] overflow-y-auto py-2">
            {filtered.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                No matching pages.
              </div>
            ) : (
              <ul className="space-y-0.5 px-2">
                {filtered.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item.href)}
                        className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-fast hover:bg-muted"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted group-hover:bg-background shrink-0">
                          <Icon className="h-3.5 w-3.5 text-foreground" strokeWidth={1.85} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-foreground truncate leading-tight">
                            {item.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                            {item.section} · {item.description}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
