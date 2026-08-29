"use client";

import { useMemo, useState } from "react";
import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArchiveRoleDialog } from "@/features/roles/components/archive-role-dialog";
import { CreateRoleDialog } from "@/features/roles/components/create-role-dialog";
import { EditRoleDialog } from "@/features/roles/components/edit-role-dialog";
import { RoleDetailSheet } from "@/features/roles/components/role-detail-sheet";
import { RolesEmptyState } from "@/features/roles/components/roles-empty-state";
import { RolesHeader } from "@/features/roles/components/roles-header";
import { RolesToolbar, type RoleFilter, type RoleSort } from "@/features/roles/components/roles-toolbar";
import { RoleCard } from "@/features/roles/components/role-card";
import { RolesSkeleton } from "@/features/roles/components/roles-skeleton";
import { useRoles } from "@/features/roles/hooks";
import { useRolesUrlState } from "@/features/roles/hooks/use-roles-url-state";
import { useRoleUiStore } from "@/features/roles/stores/role-ui-store";

export function RolesPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [sort, setSort] = useState<RoleSort>("newest");
  
  const selectedRoleId = useRoleUiStore((s) => s.selectedRoleId);
  const setSelectedRoleId = useRoleUiStore((s) => s.setSelectedRoleId);
  
  const openEditDialog = useRoleUiStore((s) => s.openEditDialog);
  const openArchiveDialog = useRoleUiStore((s) => s.openArchiveDialog);

  useRolesUrlState({ selectedRoleId, setSelectedRoleId });

  const { data, isLoading, isError, isFetching, refetch } = useRoles();

  const roles = useMemo(() => data ?? [], [data]);
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;

  const filteredRoles = useMemo(() => {
    let result = [...roles];

    // Search filter
    const normalizedSearch = search.trim().toLowerCase();
    if (normalizedSearch) {
      result = result.filter(
        (role) =>
          role.name.toLowerCase().includes(normalizedSearch) ||
          role.description?.toLowerCase().includes(normalizedSearch)
      );
    }

    // Type filter
    if (filter === "system") result = result.filter((r) => r.isSystem);
    if (filter === "custom") result = result.filter((r) => !r.isSystem);

    // Sort
    result.sort((a, b) => {
      if (sort === "users") return b.userCount - a.userCount;
      if (sort === "permissions") return b.permissionCount - a.permissionCount;
      // newest
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [roles, search, filter, sort]);

  if (isLoading && !data) {
    return <RolesSkeleton />;
  }

  if (isError) {
    return (
      <div className="space-y-4 px-6 py-5 md:px-8 max-w-6xl mx-auto">
        <RolesHeader />
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AppIcons.alertCircle className="size-5" />
              Failed to load roles
            </CardTitle>
            <CardDescription>
              We couldn&apos;t fetch your roles. Check your connection and try again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Retrying..." : "Retry"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="space-y-4 px-6 py-5 md:px-8 max-w-6xl mx-auto">
        <RolesHeader />
        <RolesEmptyState />
        <CreateRoleDialog />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 py-5 md:px-8 max-w-7xl mx-auto">
      <RolesHeader />

      <RolesToolbar 
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
      />

      {filteredRoles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-20 bg-muted/10">
          <AppIcons.roles className="size-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No roles match your filters</p>
          <Button variant="link" onClick={() => { setSearch(""); setFilter("all"); }}>
            Clear all filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRoles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onClick={() => setSelectedRoleId(role.id)}
              onEdit={() => openEditDialog(role.id)}
              onArchive={() => openArchiveDialog(role.id)}
            />
          ))}
        </div>
      )}

      <RoleDetailSheet
        roleSummary={selectedRole}
        isOpen={selectedRoleId !== null}
        onOpenChange={(open) => !open && setSelectedRoleId(null)}
      />

      <CreateRoleDialog />
      <EditRoleDialog />
      <ArchiveRoleDialog />
    </div>
  );
}
