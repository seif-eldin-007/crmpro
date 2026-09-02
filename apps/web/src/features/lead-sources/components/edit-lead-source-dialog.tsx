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
import { LeadSourceDuplicateHint } from "@/features/lead-sources/components/lead-source-duplicate-hint";
import {
  useLeadSource,
  useLeadSources,
} from "@/features/lead-sources/hooks";
import { useLeadSourceNameDuplicate } from "@/features/lead-sources/hooks/use-lead-source-name-duplicate";
import { useUpdateLeadSource } from "@/features/lead-sources/mutations";
import { useLeadSourceUiStore } from "@/features/lead-sources/stores/lead-source-ui-store";
import { usePermissions } from "@/hooks/use-permissions";

export function EditLeadSourceDialog() {
  const editLeadSourceId = useLeadSourceUiStore((s) => s.editLeadSourceId);
  const closeEditDialog = useLeadSourceUiStore((s) => s.closeEditDialog);
  const { data: listData } = useLeadSources();
  const { data: sourceDetail } = useLeadSource(editLeadSourceId ?? undefined);
  const { can } = usePermissions();

  const leadSource =
    sourceDetail ??
    listData?.items.find((item) => item.id === editLeadSourceId);
  const open = Boolean(editLeadSourceId && leadSource);

  const handleClose = () => {
    closeEditDialog();
  };

  if (!can("lead-source.update")) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit lead source</DialogTitle>
          <DialogDescription>
            Update the display name for this lead source.
          </DialogDescription>
        </DialogHeader>

        {leadSource ? (
          <EditLeadSourceForm
            key={leadSource.id}
            leadSource={leadSource}
            onClose={handleClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditLeadSourceForm({
  leadSource,
  onClose,
}: {
  leadSource: { id: string; name: string };
  onClose: () => void;
}) {
  const updateLeadSource = useUpdateLeadSource();
  const [name, setName] = useState(leadSource.name);
  const duplicate = useLeadSourceNameDuplicate(name, leadSource.id);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      await updateLeadSource.mutateAsync({
        leadSourceId: leadSource.id,
        input: { name: trimmed },
      });
      onClose();
    } catch {
      // Error toast is surfaced by useApiMutation; keep the dialog open.
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-lead-source-name">Name</Label>
        <Input
          id="edit-lead-source-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          maxLength={100}
          autoFocus
        />
        <LeadSourceDuplicateHint duplicate={duplicate} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            updateLeadSource.isPending ||
            name.trim().length < 2 ||
            name.trim() === leadSource.name ||
            Boolean(duplicate)
          }
        >
          {updateLeadSource.isPending ? "Saving..." : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
