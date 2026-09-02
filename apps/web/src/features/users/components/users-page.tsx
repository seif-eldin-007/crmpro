"use client";

import { useState } from "react";
import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChangeUserRoleDialog } from "@/features/users/components/change-user-role-dialog";
import { ConfirmUserActionDialog } from "@/features/users/components/confirm-user-action-dialog";
import { CreateUserDialog } from "@/features/users/components/create-user-dialog";
import { EditUserDialog } from "@/features/users/components/edit-user-dialog";
import { ResetPasswordDialog } from "@/features/users/components/reset-password-dialog";
import { UserDetailDrawer } from "@/features/users/components/user-detail-drawer";
import { UsersEmptyState } from "@/features/users/components/users-empty-state";
import { UsersHeader } from "@/features/users/components/users-header";
import { UsersPagination } from "@/features/users/components/users-pagination";
import { UsersSkeleton } from "@/features/users/components/users-skeleton";
import { UsersTable } from "@/features/users/components/users-table";
import { UsersToolbar } from "@/features/users/components/users-toolbar";
import { useRoles, useUsers } from "@/features/users/hooks";
import { useUsersUrlState } from "@/features/users/hooks/use-users-url-state";
import { useUserUiStore } from "@/features/users/stores/user-ui-store";
import type { UserStatusFilter, UsersSortField } from "@/features/users/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const USERS_PAGE_SIZE = 50;

export function UsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<UsersSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const debouncedSearch = useDebouncedValue(search, 400);

  const highlightedUserId = useUserUiStore((s) => s.highlightedUserId);
  const setHighlightedUserId = useUserUiStore((s) => s.setHighlightedUserId);
  const openDrawer = useUserUiStore((s) => s.openDrawer);

  useUsersUrlState({
    debouncedSearch,
    setSearch,
    roleId,
    setRoleId,
    statusFilter,
    setStatusFilter,
    highlightedUserId,
    setHighlightedUserId,
    openDrawer,
  });

  const { data: rolesData, isLoading: rolesLoading } = useRoles();

  const { data, isLoading, isError, isFetching, refetch } = useUsers({
    page,
    limit: USERS_PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
    roleId: roleId ?? undefined,
    isActive:
      statusFilter === "all"
        ? undefined
        : statusFilter === "active"
          ? true
          : false,
    sortBy,
    sortOrder,
  });

  const users = data?.items ?? [];
  const pagination = data?.pagination;
  const hasFilters =
    debouncedSearch.trim().length > 0 ||
    roleId !== null ||
    statusFilter !== "all";
  const isEmpty = users.length === 0;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleRoleIdChange = (value: string | null) => {
    setRoleId(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: UserStatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch("");
    setRoleId(null);
    setStatusFilter("all");
    setPage(1);
  };

  const handleSortChange = (
    nextSortBy: UsersSortField,
    nextSortOrder: "asc" | "desc",
  ) => {
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setPage(1);
  };

  const handleOpenUser = (userId: string) => {
    openDrawer(userId);
  };

  if (isLoading && !data) {
    return <UsersSkeleton />;
  }

  if (isError) {
    return (
      <div className="space-y-4 px-6 py-5 md:px-8">
        <UsersHeader />
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AppIcons.alertCircle className="size-5" />
              Failed to load users
            </CardTitle>
            <CardDescription>
              We couldn&apos;t fetch your team members. Check your connection
              and try again.
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

  return (
    <div className="space-y-4 px-6 py-5 md:px-8">
      <UsersHeader />

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <UsersToolbar
          search={search}
          onSearchChange={handleSearchChange}
          roleId={roleId}
          onRoleIdChange={handleRoleIdChange}
          roleOptions={rolesData ?? []}
          rolesLoading={rolesLoading}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          hasFilters={hasFilters}
          onClearFilters={handleClearFilters}
          totalItems={pagination?.totalItems ?? users.length}
          isFetching={isFetching}
        />

        {isEmpty ? (
          <UsersEmptyState hasFilters={hasFilters} />
        ) : (
          <>
            <UsersTable
              users={users}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              highlightedUserId={highlightedUserId}
              onOpenUser={handleOpenUser}
            />
            {pagination ? (
              <UsersPagination
                pagination={pagination}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </div>

      <CreateUserDialog />
      <EditUserDialog />
      <ChangeUserRoleDialog />
      <ResetPasswordDialog />
      <ConfirmUserActionDialog />
      <UserDetailDrawer />
    </div>
  );
}
