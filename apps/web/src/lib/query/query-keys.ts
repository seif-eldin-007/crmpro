import type {
  AnalyticsDateParams,
  DashboardQueryParams,
} from "@/features/dashboard/types";
import type { LeadsListParams } from "@/features/leads/types";
import type { NotificationsListParams } from "@/features/notifications/types";
import type { ListQueryParams } from "@/types/pagination";

export const queryKeys = {
  auth: {
    all: () => ["auth"] as const,
    me: () => ["auth", "me"] as const,
    permissions: () => ["auth", "permissions"] as const,
    sessions: () => ["auth", "sessions"] as const,
  },

  settings: {
    all: () => ["settings"] as const,
    notificationPreferences: () =>
      ["settings", "notification-preferences"] as const,
  },

  dashboard: {
    all: () => ["dashboard"] as const,
    summary: (params?: DashboardQueryParams | AnalyticsDateParams) =>
      ["dashboard", "summary", params ?? {}] as const,
    analytics: (scope: string, params?: AnalyticsDateParams) =>
      ["dashboard", "analytics", scope, params ?? {}] as const,
  },

  leads: {
    all: () => ["leads"] as const,
    list: (params?: LeadsListParams) => ["leads", "list", params ?? {}] as const,
    detail: (id: string) => ["leads", "detail", id] as const,
  },

  leadSources: {
    all: () => ["lead-sources"] as const,
    list: (params?: ListQueryParams) =>
      ["lead-sources", "list", params ?? {}] as const,
    detail: (id: string) => ["lead-sources", "detail", id] as const,
  },

  pipelines: {
    all: () => ["pipelines"] as const,
    list: (params?: ListQueryParams) =>
      ["pipelines", "list", params ?? {}] as const,
    detail: (id: string) => ["pipelines", "detail", id] as const,
  },

  notifications: {
    all: () => ["notifications"] as const,
    list: (params?: NotificationsListParams) =>
      ["notifications", "list", params ?? {}] as const,
    unreadCount: () => ["notifications", "unread-count"] as const,
    detail: (id: string) => ["notifications", "detail", id] as const,
  },

  users: {
    all: () => ["users"] as const,
    list: (params?: ListQueryParams) => ["users", "list", params ?? {}] as const,
    detail: (id: string) => ["users", "detail", id] as const,
    checkEmail: (email: string) => ["users", "check-email", email] as const,
    quota: () => ["users", "quota"] as const,
  },

  roles: {
    all: () => ["roles"] as const,
    list: () => ["roles", "list"] as const,
    detail: (id: string) => ["roles", "detail", id] as const,
  },

  developers: {
    all: () => ["developers"] as const,
    list: (params?: ListQueryParams) =>
      ["developers", "list", params ?? {}] as const,
    detail: (id: string) => ["developers", "detail", id] as const,
  },

  projects: {
    all: () => ["projects"] as const,
    list: (params?: ListQueryParams) =>
      ["projects", "list", params ?? {}] as const,
    detail: (id: string) => ["projects", "detail", id] as const,
  },

  files: {
    all: () => ["files"] as const,
    list: (params?: ListQueryParams) =>
      ["files", "list", params ?? {}] as const,
  },

  imports: {
    all: () => ["imports"] as const,
    list: (params?: ListQueryParams) =>
      ["imports", "list", params ?? {}] as const,
    detail: (id: string) => ["imports", "detail", id] as const,
  },

  exports: {
    all: () => ["exports"] as const,
    list: (params?: ListQueryParams) =>
      ["exports", "list", params ?? {}] as const,
    detail: (id: string) => ["exports", "detail", id] as const,
  },

  audit: {
    all: () => ["audit"] as const,
    list: (params?: Record<string, unknown>) =>
      ["audit", "list", params ?? {}] as const,
    detail: (id: string) => ["audit", "detail", id] as const,
  },

  support: {
    all: () => ["support"] as const,
    list: (params?: Record<string, unknown>) =>
      ["support", "list", params ?? {}] as const,
    detail: (id: string) => ["support", "detail", id] as const,
    unreadCount: () => ["support", "unread-count"] as const,
  },
} as const;

export type QueryKeyFactory = typeof queryKeys;
