"use client";

import { useMemo, useState, useEffect } from "react";
import { AppIcons } from "@/components/icons/app-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useRole } from "@/features/roles/hooks";
import { useUpdateRolePermissions } from "@/features/roles/mutations";
import type { Role, RoleDetail } from "@/features/roles/types";
import {
  formatPermissionActionLabel,
  PERMISSION_GROUP_LABELS,
  PERMISSION_GROUP_ORDER,
  PERMISSION_GROUPS,
  PERMISSION_DESCRIPTIONS,
  type PermissionGroupKey,
} from "@/features/roles/utils/permission-catalog";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { usePermissions } from "@/hooks/use-permissions";

interface RoleDetailSheetProps {
  roleSummary: Role | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoleDetailSheet({ roleSummary, isOpen, onOpenChange }: RoleDetailSheetProps) {
  const { data: roleDetail, isLoading, isError } = useRole(roleSummary?.id);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-2xl px-0 py-0 overflow-hidden">
        {!roleSummary ? null : isLoading && !roleDetail ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError || !roleDetail ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-destructive">
            Failed to load role details
          </div>
        ) : (
          <RoleDetailContent role={roleDetail} summary={roleSummary} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function RoleDetailContent({
  role,
  summary,
}: {
  role: RoleDetail;
  summary: Role;
}) {
  const { can } = usePermissions();
  const actorPermissions = useAuthStore((s) => s.permissions);
  const updatePermissions = useUpdateRolePermissions();
  
  // Re-initialize state if role changes
  const [selectedKeys, setSelectedKeys] = useState(role.permissionKeys);
  useEffect(() => {
    // Re-syncing editable selection when the displayed role changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedKeys(role.permissionKeys);
  }, [role.permissionKeys]);

  const [permissionSearch, setPermissionSearch] = useState("");
  const [showGrantedOnly, setShowGrantedOnly] = useState(false);

  const canManage = can("role.manage");
  const isReadOnly = !canManage || role.isSystem;

  const sortedSelected = useMemo(() => [...selectedKeys].sort(), [selectedKeys]);
  const sortedOriginal = useMemo(() => [...role.permissionKeys].sort(), [role.permissionKeys]);
  const isDirty = sortedSelected.join("|") !== sortedOriginal.join("|") && sortedSelected.length > 0;

  const canGrant = useMemo(() => (permissionKey: string) => actorPermissions.has(permissionKey), [actorPermissions]);

  const totalGrantable = useMemo(
    () => PERMISSION_GROUP_ORDER.reduce((count, groupKey) => count + [...PERMISSION_GROUPS[groupKey]].filter(canGrant).length, 0),
    [canGrant]
  );

  const grantableGroups = useMemo(() => {
    const normalizedSearch = permissionSearch.trim().toLowerCase();

    return PERMISSION_GROUP_ORDER.map((groupKey) => {
      let grantable = [...PERMISSION_GROUPS[groupKey]].filter(canGrant);
      if (grantable.length === 0) return null;

      if (showGrantedOnly) {
        grantable = grantable.filter((key) => selectedKeys.includes(key));
        if (grantable.length === 0) return null;
      }

      if (normalizedSearch) {
        const groupLabel = PERMISSION_GROUP_LABELS[groupKey].toLowerCase();
        const matchesGroup = groupLabel.includes(normalizedSearch);
        grantable = grantable.filter((key) => {
          if (matchesGroup) return true;
          return (
            formatPermissionActionLabel(key).toLowerCase().includes(normalizedSearch) ||
            key.toLowerCase().includes(normalizedSearch) ||
            (PERMISSION_DESCRIPTIONS[key] || "").toLowerCase().includes(normalizedSearch)
          );
        });
        if (grantable.length === 0) return null;
      }

      return { groupKey, grantable };
    }).filter((group) => group !== null) as Array<{ groupKey: PermissionGroupKey; grantable: string[] }>;
  }, [canGrant, permissionSearch, selectedKeys, showGrantedOnly]);

  const togglePermission = (permissionKey: string) => {
    if (isReadOnly) return;
    setSelectedKeys((current) =>
      current.includes(permissionKey)
        ? current.filter((key) => key !== permissionKey)
        : [...current, permissionKey]
    );
  };

  const toggleGroup = (groupKey: PermissionGroupKey) => {
    if (isReadOnly) return;
    const groupKeys = [...PERMISSION_GROUPS[groupKey]].filter(canGrant);
    const allOn = groupKeys.every((key) => selectedKeys.includes(key));
    setSelectedKeys((current) => {
      if (allOn) {
        return current.filter((key) => !(groupKeys as string[]).includes(key));
      }
      return [...new Set([...current, ...groupKeys])];
    });
  };

  const handleSave = async () => {
    if (selectedKeys.length === 0 || !isDirty) return;
    await updatePermissions.mutateAsync({
      roleId: role.id,
      input: { permissionKeys: selectedKeys },
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background h-full">
      <div className="space-y-4 border-b border-border/50 px-6 py-5">
        <SheetHeader className="text-left space-y-1">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-xl tracking-tight">{role.name}</SheetTitle>
            <Badge variant={role.isSystem ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px] uppercase font-medium tracking-wider">
              {role.isSystem ? "System Role" : "Custom Role"}
            </Badge>
          </div>
          <SheetDescription>
            {summary.description || "Manage permissions for this role."}
            {role.isSystem && " System roles are read-only and cannot be modified."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <div className="relative min-w-[12rem] flex-1">
            <AppIcons.search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={permissionSearch}
              onChange={(event) => setPermissionSearch(event.target.value)}
              placeholder="Filter permissions..."
              className="h-9 pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowGrantedOnly((current) => !current)}
            className={cn(
              "h-9 rounded-md px-3 text-xs font-medium transition-colors border",
              showGrantedOnly
                ? "bg-primary border-primary text-primary-foreground"
                : "bg-muted/30 border-border/70 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
          >
            Granted only ({selectedKeys.length}/{totalGrantable})
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {grantableGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <AppIcons.search className="size-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">No permissions found</p>
            <p className="text-xs">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grantableGroups.map(({ groupKey, grantable }) => (
              <PermissionGroupSection
                key={groupKey}
                groupKey={groupKey}
                grantable={grantable}
                selectedKeys={selectedKeys}
                allGroupKeys={[...PERMISSION_GROUPS[groupKey]].filter(canGrant)}
                isReadOnly={isReadOnly}
                onToggleGroup={() => toggleGroup(groupKey)}
                onTogglePermission={togglePermission}
              />
            ))}
          </div>
        )}
      </div>

      {canManage && !role.isSystem ? (
        <div className="flex items-center justify-between gap-4 border-t border-border/50 bg-muted/20 px-6 py-4">
          <p className="text-sm text-muted-foreground">
            {selectedKeys.length === 0
              ? "Select at least one permission to save."
              : isDirty
                ? "You have unsaved changes."
                : "Permissions are up to date."}
          </p>
          <Button
            className="w-32"
            disabled={updatePermissions.isPending || !isDirty || selectedKeys.length === 0}
            onClick={() => void handleSave()}
          >
            {updatePermissions.isPending ? (
              <>
                <AppIcons.loader className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PermissionGroupSection({
  groupKey,
  grantable,
  selectedKeys,
  allGroupKeys,
  isReadOnly,
  onToggleGroup,
  onTogglePermission,
}: {
  groupKey: PermissionGroupKey;
  grantable: string[];
  selectedKeys: string[];
  allGroupKeys: string[];
  isReadOnly: boolean;
  onToggleGroup: () => void;
  onTogglePermission: (key: string) => void;
}) {
  const selectedCount = allGroupKeys.filter((key) => selectedKeys.includes(key)).length;
  const allSelected = allGroupKeys.length > 0 && allGroupKeys.every((key) => selectedKeys.includes(key));
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Checkbox 
            id={`group-${groupKey}`}
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={onToggleGroup} 
            disabled={isReadOnly}
            className="data-[state=checked]:bg-primary"
          />
          <Label 
            htmlFor={`group-${groupKey}`} 
            className={cn("text-sm font-semibold text-foreground cursor-pointer", isReadOnly && "cursor-default")}
          >
            {PERMISSION_GROUP_LABELS[groupKey]}
          </Label>
          <span className="rounded-full bg-background border px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {selectedCount}/{allGroupKeys.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border/50 sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-2">
        {grantable.map((permissionKey) => {
          const active = selectedKeys.includes(permissionKey);
          return (
            <div 
              key={permissionKey} 
              className={cn(
                "flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30",
                active && "bg-primary/5 hover:bg-primary/10"
              )}
            >
              <Checkbox 
                id={`perm-${permissionKey}`} 
                checked={active} 
                onCheckedChange={() => onTogglePermission(permissionKey)} 
                disabled={isReadOnly}
                className="mt-0.5"
              />
              <Label 
                htmlFor={`perm-${permissionKey}`} 
                className={cn("flex flex-1 flex-col gap-1 cursor-pointer", isReadOnly && "cursor-default")}
              >
                <span className="text-xs font-medium leading-none text-foreground">
                   {formatPermissionActionLabel(permissionKey)}
                </span>
                <span className="text-[11px] text-muted-foreground/90 leading-relaxed">
                   {PERMISSION_DESCRIPTIONS[permissionKey] ?? permissionKey}
                </span>
              </Label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
