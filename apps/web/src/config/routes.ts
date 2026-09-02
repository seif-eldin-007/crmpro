import { AppIcons, type AppIcon } from "@/components/icons/app-icons";

/**
 * Config-driven navigation.
 *
 * Single source of truth for the sidebar, command palette, route guards and
 * breadcrumbs. Never hardcode nav links in components — consume this.
 */
export interface NavRoute {
  label: string;
  href: string;
  subtitle: string;
  icon: AppIcon;
  /**
   * Permissions required to see/access this route. Empty array = always visible
   * to authenticated users. Permission checks (not role names) drive access.
   */
  requiredPermissions: string[];
  /** Whether this route appears in the command palette search. */
  searchable: boolean;
  /** Extra search terms for the command palette. */
  keywords: string[];
}

export interface NavGroup {
  label: string;
  routes: NavRoute[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Main",
    routes: [
      {
        label: "Dashboard",
        href: "/dashboard",
        subtitle: "Overview of your agency activity",
        icon: AppIcons.dashboard,
        requiredPermissions: [],
        searchable: true,
        keywords: ["home", "overview", "analytics"],
      },
      {
        label: "Leads",
        href: "/leads",
        subtitle: "Manage and track customer leads",
        icon: AppIcons.leads,
        requiredPermissions: ["lead.read"],
        searchable: true,
        keywords: ["contacts", "prospects", "clients"],
      },
      {
        label: "Pipelines",
        href: "/pipelines",
        subtitle: "Track leads through your sales stages",
        icon: AppIcons.pipelines,
        requiredPermissions: ["pipeline.read"],
        searchable: true,
        keywords: ["stages", "funnel", "board"],
      },
    ],
  },
  {
    label: "Catalog",
    routes: [
      {
        label: "Developers",
        href: "/developers",
        subtitle: "Real estate developers catalog",
        icon: AppIcons.developers,
        requiredPermissions: ["developer.read"],
        searchable: true,
        keywords: ["builders", "companies"],
      },
      {
        label: "Projects",
        href: "/projects",
        subtitle: "Projects offered to your leads",
        icon: AppIcons.projects,
        requiredPermissions: ["project.read"],
        searchable: true,
        keywords: ["properties", "developments"],
      },
      {
        label: "Lead Sources",
        href: "/lead-sources",
        subtitle: "Where your leads come from",
        icon: AppIcons.leadSources,
        requiredPermissions: ["lead-source.read"],
        searchable: true,
        keywords: ["channels", "campaigns", "origin"],
      },
    ],
  },
  {
    label: "Team",
    routes: [
      {
        label: "Users",
        href: "/users",
        subtitle: "Manage agency members",
        icon: AppIcons.users,
        requiredPermissions: ["user.read"],
        searchable: true,
        keywords: ["team", "staff", "members", "agents"],
      },
      {
        label: "Roles",
        href: "/roles",
        subtitle: "Roles and permissions",
        icon: AppIcons.roles,
        requiredPermissions: ["role.read"],
        searchable: true,
        keywords: ["permissions", "access", "rbac"],
      },
    ],
  },
  {
    label: "Operations",
    routes: [
      {
        label: "Files",
        href: "/files",
        subtitle: "Uploaded documents and attachments",
        icon: AppIcons.files,
        requiredPermissions: ["file.read"],
        searchable: true,
        keywords: ["documents", "attachments", "storage"],
      },
      {
        label: "Imports",
        href: "/imports",
        subtitle: "Import leads from CSV",
        icon: AppIcons.imports,
        requiredPermissions: ["import-job.read"],
        searchable: true,
        keywords: ["upload", "csv", "bulk"],
      },
      {
        label: "Exports",
        href: "/exports",
        subtitle: "Export data to CSV",
        icon: AppIcons.exports,
        requiredPermissions: ["export-job.read"],
        searchable: true,
        keywords: ["download", "csv", "reports"],
      },
      {
        label: "Audit",
        href: "/audit",
        subtitle: "Activity and change history",
        icon: AppIcons.audit,
        requiredPermissions: ["audit.read"],
        searchable: true,
        keywords: ["logs", "history", "activity"],
      },
      {
        label: "Support",
        href: "/support",
        subtitle: "Chat with CRMPro platform support",
        icon: AppIcons.lifeBuoy,
        requiredPermissions: ["support.read"],
        searchable: true,
        keywords: ["help", "ticket", "contact", "chat", "support", "inbox"],
      },
    ],
  },
];

/** Account routes available via topbar / command palette (not primary sidebar). */
export const accountRoutes: NavRoute[] = [
  {
    label: "Notifications",
    href: "/notifications",
    subtitle: "Alerts and activity for your account",
    icon: AppIcons.notifications,
    requiredPermissions: ["notification.read"],
    searchable: true,
    keywords: ["alerts", "inbox", "unread", "activity"],
  },
  {
    label: "Settings",
    href: "/settings",
    subtitle: "Profile, sessions, and preferences",
    icon: AppIcons.settings,
    requiredPermissions: [],
    searchable: true,
    keywords: ["account", "profile", "preferences", "security", "workspace"],
  },
];

/** Flat list of every navigable route. */
export const allRoutes: NavRoute[] = [
  ...navGroups.flatMap((group) => group.routes),
  ...accountRoutes,
];

/** Find the route whose href best matches a pathname (for topbar/breadcrumbs). */
export function findRouteByPath(pathname: string): NavRoute | undefined {
  return allRoutes.find(
    (route) => pathname === route.href || pathname.startsWith(`${route.href}/`),
  );
}

/** Look up a route by its exact href (used by placeholder pages). */
export function getRoute(href: string): NavRoute | undefined {
  return allRoutes.find((route) => route.href === href);
}
