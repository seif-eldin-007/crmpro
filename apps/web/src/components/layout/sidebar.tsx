"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { navGroups } from "@/config/routes";
import { usePermissions } from "@/hooks/use-permissions";
import { useSupportUnreadCount } from "@/features/support/hooks";
import { useUIStore } from "@/stores/ui-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/* ─── Brand ───────────────────────────────────────────────────────────────── */

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4",
        collapsed && "justify-center px-0",
      )}
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-[13px] font-bold text-sidebar-primary-foreground">
        C
      </div>
      {!collapsed && (
        <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
          CRMPro
        </span>
      )}
    </div>
  );
}

/* ─── Nav ─────────────────────────────────────────────────────────────────── */

function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { canAccessRoute } = usePermissions();
  const { data: unreadCount } = useSupportUnreadCount();

  return (
    <nav className="scrollbar-none flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-4">
      {navGroups.map((group) => {
        const visibleRoutes = group.routes.filter(canAccessRoute);
        if (visibleRoutes.length === 0) return null;

        return (
          <div key={group.label} className="flex flex-col gap-0.5">
            {!collapsed && (
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/35">
                {group.label}
              </p>
            )}
            {visibleRoutes.map((route) => {
              const Icon = route.icon;
              const active =
                pathname === route.href ||
                pathname.startsWith(`${route.href}/`);

              const link = (
                <Link
                  key={route.href}
                  href={route.href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-md py-[9px] text-[13px] font-medium",
                    "transition-all duration-150",
                    // Collapsed: icon centered, no horizontal padding needed
                    collapsed ? "justify-center px-[9px]" : "px-2.5",
                    // Idle
                    "text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    // Active
                    active &&
                      "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0 transition-colors duration-150",
                      active
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70",
                    )}
                    stroke={active ? 2.25 : 1.75}
                  />
                  {!collapsed && (
                    <span className="truncate leading-none">{route.label}</span>
                  )}
                  
                  {!collapsed && route.label === "Support" && unreadCount ? (
                    <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sidebar-primary px-1 text-[10px] font-bold leading-none text-sidebar-primary-foreground">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                  {collapsed && route.label === "Support" && unreadCount ? (
                    <span className="absolute right-1 top-1 flex size-2 rounded-full bg-sidebar-primary" />
                  ) : null}

                  {/* Active right-edge accent */}
                  {active && !collapsed && route.label !== "Support" && (
                    <span className="absolute right-2 size-1 rounded-full bg-sidebar-primary opacity-70" />
                  )}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={route.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {route.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}
          </div>
        );
      })}
    </nav>
  );
}

/* ─── Desktop sidebar ─────────────────────────────────────────────────────── */

export function Sidebar() {
  const collapsed = useUIStore((state) => state.sidebarCollapsed);

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-[52px]" : "w-60",
      )}
    >
      <SidebarBrand collapsed={collapsed} />
      <SidebarNav collapsed={collapsed} />
    </aside>
  );
}

/* ─── Mobile sidebar (drawer) ─────────────────────────────────────────────── */

export function MobileSidebar() {
  const t = useTranslations("shell");
  const open = useUIStore((state) => state.mobileSidebarOpen);
  const closeMobileSidebar = useUIStore((state) => state.closeMobileSidebar);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeMobileSidebar();
      }}
    >
      <SheetContent
        side="left"
        className="w-60 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
        <SidebarBrand collapsed={false} />
        <SidebarNav collapsed={false} onNavigate={closeMobileSidebar} />
      </SheetContent>
    </Sheet>
  );
}
