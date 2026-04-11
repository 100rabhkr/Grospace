import type { LucideIcon } from "lucide-react";
import {
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

export type UserRole = "platform_admin" | "org_admin" | "org_member";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  minRole?: UserRole;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const ROLE_RANK: Record<UserRole, number> = {
  platform_admin: 3,
  org_admin: 2,
  org_member: 1,
};

export const roleLabels: Record<string, string> = {
  platform_admin: "Platform Admin",
  org_admin: "Org Admin",
  org_member: "Member",
};

export function hasAccess(userRole: UserRole, minRole?: UserRole): boolean {
  if (!minRole) return true;
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
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
  {
    label: "Admin",
    items: [
      {
        label: "Organizations",
        href: "/organizations",
        icon: Building2,
        description: "Multi-org oversight and account provisioning",
        minRole: "platform_admin",
      },
    ],
  },
];

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
