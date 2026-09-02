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
import { useLeadSourceNameDuplicate } from "@/features/lead-sources/hooks/use-lead-source-name-duplicate";
import { useCreateLeadSource } from "@/features/lead-sources/mutations";
import { useLeadSourceUiStore } from "@/features/lead-sources/stores/lead-source-ui-store";
import { usePermissions } from "@/hooks/use-permissions";

export function CreateLeadSourceDialog() {
  const open = useLeadSourceUiStore((s) => s.createDialogOpen);
  const closeCreateDialog = useLeadSourceUiStore((s) => s.closeCreateDialog);
  const createLeadSource = useCreateLeadSource();
  const { can } = usePermissions();
  const [name, setName] = useState("");
  const duplicate = useLeadSourceNameDuplicate(name);

  const handleClose = () => {
    closeCreateDialog();
    setName("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      await createLeadSource.mutateAsync({ name: trimmed });
      handleClose();
    } catch {
      // Error toast is surfaced by useApiMutation; keep the dialog open.
    }
  };

  if (!can("lead-source.create")) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New lead source</DialogTitle>
          <DialogDescription>
            Add a channel, campaign, or origin your leads come from.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lead-source-name">Name</Label>
            <Input
              id="lead-source-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Facebook Ads"
              required
              minLength={2}
              maxLength={100}
              autoFocus
            />
            <LeadSourceDuplicateHint duplicate={duplicate} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                createLeadSource.isPending ||
                name.trim().length < 2 ||
                Boolean(duplicate)
              }
            >
              {createLeadSource.isPending ? "Creating..." : "Create lead source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
