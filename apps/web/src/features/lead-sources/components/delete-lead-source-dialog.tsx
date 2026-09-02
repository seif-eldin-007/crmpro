"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useLeadSource,
  useLeadSources,
} from "@/features/lead-sources/hooks";
import { useDeleteLeadSource } from "@/features/lead-sources/mutations";
import { useLeadSourceUiStore } from "@/features/lead-sources/stores/lead-source-ui-store";
import { usePermissions } from "@/hooks/use-permissions";

export function DeleteLeadSourceDialog() {
  const deleteLeadSourceId = useLeadSourceUiStore((s) => s.deleteLeadSourceId);
  const closeDeleteDialog = useLeadSourceUiStore((s) => s.closeDeleteDialog);
  const { data: listData } = useLeadSources();
  const { data: sourceDetail } = useLeadSource(deleteLeadSourceId ?? undefined);
  const deleteLeadSource = useDeleteLeadSource();
  const { can } = usePermissions();
  const [confirmName, setConfirmName] = useState("");

  const leadSource =
    sourceDetail ??
    listData?.items.find((item) => item.id === deleteLeadSourceId);
  const open = Boolean(deleteLeadSourceId && leadSource);

  const handleClose = () => {
    closeDeleteDialog();
    setConfirmName("");
  };

  const handleDelete = async () => {
    if (!deleteLeadSourceId || !leadSource) return;

    try {
      await deleteLeadSource.mutateAsync(deleteLeadSourceId);
      handleClose();
    } catch {
      // In-use sources are rejected by the API; the toast explains why and the
      // dialog stays open so the user can cancel.
    }
  };

  if (!can("lead-source.delete")) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete lead source</DialogTitle>
          <DialogDescription>
            This removes &quot;{leadSource?.name}&quot; from your catalog.
            Sources currently used by leads cannot be deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="confirm-lead-source-name">
            Type <span className="font-medium">{leadSource?.name}</span> to
            confirm
          </Label>
          <Input
            id="confirm-lead-source-name"
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            placeholder={leadSource?.name}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={
              deleteLeadSource.isPending ||
              confirmName.trim() !== leadSource?.name
            }
            onClick={() => void handleDelete()}
          >
            {deleteLeadSource.isPending ? "Deleting..." : "Delete lead source"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
