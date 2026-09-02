"use client";

import { useEffect, useMemo, useState } from "react";
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
import { AppIcons } from "@/components/icons/app-icons";
import { accountRoutes, navGroups } from "@/config/routes";
import { quickActions } from "@/config/quick-actions";
import { useGlobalSearch } from "@/features/search/hooks";
import type { SearchHit } from "@/features/search/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePermissions } from "@/hooks/use-permissions";
import { useUIStore } from "@/stores/ui-store";

/**
 * Global command palette.
 *
 * Navigation + create actions from route config, plus live platform search
 * (tenants / plans / contracts / admins) via GET /search.
 */
export function CommandPalette() {
  const router = useRouter();
  const t = useTranslations("shell.commandPalette");
  const open = useUIStore((state) => state.commandPaletteOpen);
  const toggle = useUIStore((state) => state.toggleCommandPalette);
  const close = useUIStore((state) => state.closeCommandPalette);
  const { canAccessRoute } = usePermissions();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);

  const { data: searchResult, isFetching: searchFetching } = useGlobalSearch(
    debouncedQuery,
    { enabled: open },
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  useEffect(() => {
    if (!open) {
      // Clearing the query when the palette (external store) closes
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
    }
  }, [open]);

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

  const hitGroups = useMemo(() => {
    if (!searchResult) return [];
    const groups: Array<{ heading: string; items: SearchHit[] }> = [
      { heading: t("hitGroups.tenants"), items: searchResult.tenants },
      { heading: t("hitGroups.plans"), items: searchResult.plans },
      { heading: t("hitGroups.contracts"), items: searchResult.contracts },
      { heading: t("hitGroups.admins"), items: searchResult.admins },
    ];
    return groups.filter((group) => group.items.length > 0);
  }, [searchResult, t]);

  const hasHits = hitGroups.length > 0;
  const searching =
    open && debouncedQuery.trim().length >= 2 && searchFetching && !hasHits;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? undefined : close())}
      title={t("title")}
      description={t("description")}
      className="cmd-palette-content"
    >
      <CommandInput
        placeholder={t("placeholder")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? t("searching") : t("empty")}
        </CommandEmpty>

        {hitGroups.map((group) => (
          <CommandGroup key={group.heading} heading={group.heading}>
            {group.items.map((hit) => (
              <CommandItem
                key={`${hit.type}-${hit.id}`}
                value={`${hit.title} ${hit.subtitle} ${hit.type} ${query}`}
                onSelect={() => go(hit.href)}
              >
                <HitIcon type={hit.type} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{hit.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {hit.subtitle}
                    {hit.status ? ` · ${hit.status}` : ""}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {hasHits ? <CommandSeparator /> : null}

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

function HitIcon({ type }: { type: SearchHit["type"] }) {
  const Icon =
    type === "tenant"
      ? AppIcons.building
      : type === "plan"
        ? AppIcons.chartBar
        : type === "contract"
          ? AppIcons.files
          : AppIcons.user;
  return <Icon className="size-4 shrink-0" stroke={1.75} />;
}
