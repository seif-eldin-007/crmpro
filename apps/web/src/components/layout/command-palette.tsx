"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { accountRoutes, navGroups } from "@/config/routes";
import { quickActions } from "@/config/quick-actions";
import { usePermissions } from "@/hooks/use-permissions";
import { useUIStore } from "@/stores/ui-store";

/**
 * Global command palette.
 *
 * The `.cmd-palette-content` class in globals.css keeps the dialog exactly
 * centered while preserving a subtle scale/fade animation.
 *
 * Phase 1: navigation + quick-action entries from route config.
 * TODO(phase-2): real search across leads/projects/users via the API.
 */
export function CommandPalette() {
  const router = useRouter();
  const t = useTranslations("shell.commandPalette");
  const open = useUIStore((state) => state.commandPaletteOpen);
  const toggle = useUIStore((state) => state.toggleCommandPalette);
  const close = useUIStore((state) => state.closeCommandPalette);
  const { canAccessRoute } = usePermissions();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key?.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const searchableGroups = [
    ...navGroups,
    { label: t("accountGroup"), routes: accountRoutes },
  ]
    .map((group) => ({
      ...group,
      routes: group.routes.filter(
        (route) => route.searchable && canAccessRoute(route),
      ),
    }))
    .filter((group) => group.routes.length > 0);

  const visibleActions = quickActions.filter(canAccessRoute);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title={t("title")}
      description={t("description")}
      className="cmd-palette-content"
    >
      <CommandInput placeholder={t("placeholder")} />
      <CommandList>
        <CommandEmpty>{t("empty")}</CommandEmpty>

        {searchableGroups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.routes.map((route) => {
              const Icon = route.icon;
              return (
                <CommandItem
                  key={route.href}
                  value={`${route.label} ${route.keywords.join(" ")}`}
                  onSelect={() => go(route.href)}
                >
                  <Icon className="size-4" stroke={1.75} />
                  <span>{route.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        {visibleActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("actionsGroup")}>
              {visibleActions.map((action) => {
                const Icon = action.icon;
                return (
                  <CommandItem
                    key={action.label}
                    value={action.label}
                    onSelect={() => go(action.href)}
                  >
                    <Icon className="size-4" stroke={1.75} />
                    <span>{action.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
