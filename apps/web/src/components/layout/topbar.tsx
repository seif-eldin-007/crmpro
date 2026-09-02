"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { findRouteByPath } from "@/config/routes";
import { quickActions } from "@/config/quick-actions";
import { usePermissions } from "@/hooks/use-permissions";
import { useLogout } from "@/features/auth/hooks/use-auth-actions";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";

/* ─── Command trigger ─────────────────────────────────────────────────────── */

function CommandTrigger({ onOpen }: { onOpen?: () => void }) {
  const t = useTranslations("shell.topbar");
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Syncing external browser state once after mount to avoid SSR hydration mismatch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMac(/mac/i.test(navigator.platform));
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        openCommandPalette();
      }}
      className={cn(
        "group flex w-full min-w-[280px] max-w-md items-center gap-2 rounded-lg border border-input/60 bg-muted/40",
        "px-3 py-1.5 text-sm text-muted-foreground",
        "transition-all duration-150 hover:border-input hover:bg-muted/70 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <AppIcons.search
        className="size-3.5 shrink-0 transition-colors duration-150 group-hover:text-foreground"
        stroke={2}
      />
      <span className="flex-1 select-none text-left text-[13px]">
        {t("searchPlaceholder")}
      </span>
      <kbd className="pointer-events-none hidden select-none items-center rounded border border-input/60 bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

function CompactCommandTrigger({ onOpen }: { onOpen?: () => void }) {
  const t = useTranslations("shell.topbar");
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0 rounded-lg transition-all duration-150 xl:hidden"
      aria-label={t("openCommandPalette")}
      title={t("searchPlaceholder")}
      onClick={() => {
        onOpen?.();
        openCommandPalette();
      }}
    >
      <AppIcons.search className="size-[18px]" stroke={1.75} />
    </Button>
  );
}

/* ─── Quick actions ───────────────────────────────────────────────────────── */

function QuickActions({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("shell.topbar");
  const router = useRouter();
  const { canAccessRoute } = usePermissions();
  const visible = quickActions.filter(canAccessRoute);
  if (visible.length === 0) return null;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className={cn(
            "h-8 w-8 gap-1.5 rounded-md px-0 text-xs font-semibold shadow-xs sm:w-auto sm:px-2.5",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "ring-1 ring-primary/20 transition-all duration-150",
            "dark:ring-primary/30",
          )}
        >
          <AppIcons.create className="size-3.5" stroke={2.5} />
          <span className="hidden sm:inline">{t("new")}</span>
          <span className="mx-0.5 hidden h-3.5 w-px bg-primary-foreground/25 sm:block" />
          <AppIcons.chevronDown
            className="hidden size-3 text-primary-foreground/85 sm:block"
            stroke={2.5}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {visible.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.label}
              onSelect={() => {
                onOpenChange?.(false);
                router.push(action.href);
              }}
            >
              <Icon className="size-4" stroke={1.75} />
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Theme toggle ────────────────────────────────────────────────────────── */

function ThemeToggle() {
  const t = useTranslations("shell.topbar");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    // Syncing external DOM state once after mount to avoid SSR hydration mismatch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;

    root.classList.add("theme-transition");
    // Force the browser to apply the transition class before color variables swap.
    void root.offsetWidth;

    root.classList.toggle("dark", nextTheme === "dark");
    root.style.colorScheme = nextTheme;
    localStorage.setItem("crmpro-theme", nextTheme);
    setTheme(nextTheme);

    window.setTimeout(() => {
      root.classList.remove("theme-transition");
    }, 280);
  };

  const Icon = theme === "dark" ? AppIcons.lightMode : AppIcons.darkMode;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0 rounded-lg transition-all duration-150"
      aria-label={theme === "dark" ? t("switchToLight") : t("switchToDark")}
      title={theme === "dark" ? t("switchToLight") : t("switchToDark")}
      onClick={toggleTheme}
    >
      <Icon className="size-[18px]" stroke={1.75} />
    </Button>
  );
}

/* ─── User menu ───────────────────────────────────────────────────────────── */

function UserMenu({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("shell.topbar");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { logout, isLoggingOut } = useLogout();

  const name = user?.name ?? t("userMenu.defaultName");
  const roleName = user?.role.name ?? t("userMenu.defaultRole");
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 shrink-0 gap-1 rounded-lg px-1 transition-all duration-150 sm:gap-2 sm:px-1.5"
        >
          <Avatar className="size-6 ring-1 ring-border">
            <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden flex-col items-start leading-none md:flex">
            <span className="text-[13px] font-medium">{name}</span>
            <span className="text-[11px] text-muted-foreground">{roleName}</span>
          </div>
          <AppIcons.chevronDown
            className="hidden size-3 text-muted-foreground sm:block"
            stroke={2.5}
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="flex flex-col pb-1">
          <span className="text-sm">{name}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {roleName}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            onOpenChange?.(false);
            router.push("/settings");
          }}
        >
          <AppIcons.profile className="size-4" stroke={1.75} />
          {t("userMenu.profile")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onOpenChange?.(false);
            router.push("/support");
          }}
        >
          <AppIcons.lifeBuoy className="size-4" stroke={1.75} />
          {t("userMenu.support")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onOpenChange?.(false);
            router.push("/settings");
          }}
        >
          <AppIcons.settings className="size-4" stroke={1.75} />
          {t("userMenu.settings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoggingOut}
          onSelect={() => {
            onOpenChange?.(false);
            void logout();
          }}
        >
          <AppIcons.logout className="size-4" stroke={1.75} />
          {isLoggingOut ? t("userMenu.loggingOut") : t("userMenu.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── Topbar ──────────────────────────────────────────────────────────────── */

export function Topbar() {
  const t = useTranslations("shell.topbar");
  const pathname = usePathname();
  const route = findRouteByPath(pathname);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const openMobileSidebar = useUIStore((s) => s.openMobileSidebar);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const [mobileOverlay, setMobileOverlay] = useState<
    "notifications" | "create" | "user" | null
  >(null);

  useEffect(() => {
    if (commandPaletteOpen) {
      // Closing the mobile overlay is a reaction to the palette (external store) opening
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMobileOverlay(null);
    }
  }, [commandPaletteOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1.5 border-b bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:gap-2 sm:px-3 md:px-4">
      {/* Mobile drawer toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-lg md:hidden"
        aria-label={t("openNavigation")}
        onClick={openMobileSidebar}
      >
        <AppIcons.menu className="size-4" stroke={2} />
      </Button>

      {/* Desktop collapse toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden h-8 w-8 rounded-lg transition-all duration-150 md:inline-flex"
        aria-label={t("toggleSidebar")}
        onClick={toggleSidebar}
      >
        {collapsed ? (
          <AppIcons.sidebarExpand className="size-4" stroke={2} />
        ) : (
          <AppIcons.sidebarCollapse className="size-4" stroke={2} />
        )}
      </Button>

      {/* Left: page title + subtitle */}
      <div className="flex min-w-0 flex-1 flex-col justify-center xl:flex-none">
        <h1 className="truncate text-[13px] font-semibold leading-tight text-foreground">
          {route?.label ?? "CRMPro"}
        </h1>
        {route?.subtitle && (
          <p className="hidden truncate text-[11px] leading-tight text-muted-foreground sm:block">
            {route.subtitle}
          </p>
        )}
      </div>

      {/* Center: command palette trigger */}
      <div className="ml-auto hidden flex-1 justify-center px-4 lg:px-8 xl:flex">
        <CommandTrigger onOpen={() => setMobileOverlay(null)} />
      </div>

      {/* Right: notifications · quick actions · divider · user */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <CompactCommandTrigger onOpen={() => setMobileOverlay(null)} />
        <NotificationBell
          mobileOpen={mobileOverlay === "notifications"}
          onMobileOpenChange={(open) =>
            setMobileOverlay(open ? "notifications" : null)
          }
        />
        <ThemeToggle />
        <QuickActions
          open={mobileOverlay === "create"}
          onOpenChange={(open) => setMobileOverlay(open ? "create" : null)}
        />
        <Separator
          orientation="vertical"
          className="mx-1.5 hidden h-5 opacity-50 sm:block"
        />
        <UserMenu
          open={mobileOverlay === "user"}
          onOpenChange={(open) => setMobileOverlay(open ? "user" : null)}
        />
      </div>
    </header>
  );
}
