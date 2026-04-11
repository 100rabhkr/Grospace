import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Building2,
  Cpu,
  FileCheck,
  Kanban,
  LayoutDashboard,
  Map,
  Plus,
  ScrollText,
  Settings,
  Shield,
  Store,
  Wallet,
} from "lucide-react";

export type UserRole =
  | "platform_admin"    // CEO  — full access to everything
  | "org_admin"         // Admin — full CRUD on their org + member management
  | "finance_viewer"    // CFO  — read-only financial view
  | "org_member";       // Manager — operations (view + light updates)

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  minRole?: UserRole;
  // Hide this item for these specific roles (used for write-only actions
  // that don't map cleanly onto a rank hierarchy, e.g. CFO shouldn't see
  // "Add Outlet" even though they have high privilege for reporting)
  hideForRoles?: UserRole[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// Rank = "how much do you see overall".
// platform_admin     → 4 (everything, including cross-org)
// org_admin          → 3 (everything in their org, incl. write + members)
// finance_viewer     → 2 (everything in their org, read-only)
// org_member         → 1 (operations view, some updates)
export const ROLE_RANK: Record<UserRole, number> = {
  platform_admin: 4,
  org_admin: 3,
  finance_viewer: 2,
  org_member: 1,
};

export const roleLabels: Record<string, string> = {
  platform_admin: "Platform Admin",
  org_admin: "Org Admin",
  finance_viewer: "Finance",
  org_member: "Member",
};

/**
 * Does `userRole` have access to a nav item that needs `minRole`?
 *
 * Write-oriented items (add outlet, upload docs, pipeline, settings)
 * tag themselves with `org_admin` or higher via `minRole`. Read-oriented
 * items pass `minRole` undefined and are visible to everyone.
 *
 * `finance_viewer` is rank 2 so it passes when minRole = "org_member" (1)
 * but fails when minRole = "org_admin" (3). That matches the intent:
 * finance can see everything operational but cannot create/edit.
 */
export function hasAccess(userRole: UserRole, minRole?: UserRole): boolean {
  if (!minRole) return true;
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

/** Can this role write to CRUD endpoints? Used to hide inline buttons. */
export function canWrite(userRole: UserRole | undefined | null): boolean {
  if (!userRole) return false;
  return userRole === "platform_admin" || userRole === "org_admin";
}

/** Can this role see settings / team management? */
export function canManageOrg(userRole: UserRole | undefined | null): boolean {
  if (!userRole) return false;
  return userRole === "platform_admin" || userRole === "org_admin";
}

export const quickActions: NavItem[] = [
  {
    label: "Add Outlet",
    href: "/outlets?action=create",
    icon: Plus,
    description: "Create and stage a new location",
    minRole: "org_admin",
  },
  {
    label: "Upload Docs",
    href: "/agreements/upload",
    icon: ScrollText,
    description: "Ingest leases and extract structured data",
    minRole: "org_admin",
  },
];

// ============================================================================
// Org-scoped nav (org_admin / org_member / finance_viewer)
// ============================================================================
// This is the "real" app sidebar — outlets, agreements, pipeline, payments,
// reminders, reports, settings. Platform admins DO NOT see this — they get
// platformAdminNavSections below instead.

export const navSections: NavSection[] = [
  {
    label: "Workspace",
    items: [
      {
        label: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
        description: "Executive overview, health, and financial pulse",
      },
      {
        label: "Map View",
        href: "/map",
        icon: Map,
        description: "Geographic coverage and city-level clustering",
      },
      {
        label: "Gro AI",
        href: "/ai-assistant",
        icon: Bot,
        description: "Portfolio copilot for search, answers, and actions",
      },
    ],
  },
  {
    label: "Portfolio",
    items: [
      {
        label: "Outlets",
        href: "/outlets",
        icon: Store,
        description: "Store directory, performance, and lifecycle status",
      },
      {
        label: "Agreements",
        href: "/agreements",
        icon: FileCheck,
        description: "Lease records, extracted fields, and document review",
      },
      {
        label: "Pipeline",
        href: "/pipeline",
        icon: Kanban,
        description: "Lead-to-live deal flow and stage movement",
        minRole: "org_admin",
      },
      {
        label: "Processing",
        href: "/processing",
        icon: Cpu,
        description: "Track document extraction jobs and review readiness",
      },
    ],
  },
  {
    label: "Operate",
    items: [
      {
        label: "Reminders",
        href: "/alerts",
        icon: Bell,
        description: "Deadlines, escalations, renewal windows, and follow-ups",
      },
      {
        label: "Licenses",
        href: "/renewals",
        icon: Shield,
        description: "Compliance expiries, renewals, and audit dates",
        minRole: "org_admin",
      },
      {
        label: "Payments",
        href: "/payments",
        icon: Wallet,
        description: "Payables, statuses, and monthly collection hygiene",
      },
      {
        label: "Reports",
        href: "/reports",
        icon: BarChart3,
        description: "Export-ready portfolio analytics and benchmarking",
      },
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        description: "Team, preferences, templates, and organization controls",
        minRole: "org_admin",
      },
    ],
  },
];

// ============================================================================
// Platform Admin nav (Super Admin)
// ============================================================================
// Completely different sidebar for role=platform_admin. The Super Admin
// never touches individual outlets/agreements/payments — they manage the
// whole customer roster, dispatch invites, and monitor platform health.
// Drilling into a specific org's workspace happens via /organizations/{id}.

export const platformAdminNavSections: NavSection[] = [
  {
    label: "Platform",
    items: [
      {
        label: "Overview",
        href: "/",
        icon: LayoutDashboard,
        description: "All customer organizations, platform stats, onboarding status",
      },
      {
        label: "Organizations",
        href: "/organizations",
        icon: Building2,
        description: "Multi-org oversight, provisioning, billing, admin rotation",
      },
      {
        label: "Activity",
        href: "/activity",
        icon: Activity,
        description: "Cross-org audit trail mirrored from every org's Google Sheet tab",
      },
    ],
  },
  {
    label: "Tools",
    items: [
      {
        label: "Gro AI",
        href: "/ai-assistant",
        icon: Bot,
        description: "Ask anything across every org's data",
      },
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        description: "Platform-wide settings, create orgs, rotate admin credentials",
      },
    ],
  },
];

/**
 * Returns the sidebar sections a user should see based on their role.
 * Super Admin (platform_admin) gets the stripped-down Platform nav;
 * every other role gets the full org-scoped nav.
 */
export function getNavSectionsForRole(role: UserRole | undefined | null): NavSection[] {
  if (role === "platform_admin") return platformAdminNavSections;
  return navSections;
}

const contextualItems: NavItem[] = [
  {
    label: "Agreement Detail",
    href: "/agreements/",
    icon: FileCheck,
    description: "Review extracted data, risks, obligations, and document context",
  },
  {
    label: "Outlet Detail",
    href: "/outlets/",
    icon: Store,
    description: "Operational profile, events, contacts, and attached records",
  },
  {
    label: "Organization Detail",
    href: "/organizations/",
    icon: Building2,
    description: "Organization-level activity, outlets, and agreement coverage",
  },
  {
    label: "LeaseBot",
    href: "/leasebot",
    icon: Bot,
    description: "External AI document analyzer and showcase entry point",
  },
];

export const allNavItems: NavItem[] = [
  ...quickActions,
  ...navSections.flatMap((section) => section.items),
  ...contextualItems,
];

export function isNavItemActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  const baseHref = item.href.split("?")[0];
  return pathname === baseHref || (baseHref !== "/" && pathname.startsWith(baseHref));
}

export function findNavItem(pathname: string | null): NavItem | undefined {
  if (!pathname) return undefined;
  return allNavItems.find((item) => isNavItemActive(pathname, item));
}
