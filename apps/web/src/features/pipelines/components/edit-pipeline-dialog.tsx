"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { usePipelines, usePipeline } from "@/features/pipelines/hooks";
import { useUpdatePipeline } from "@/features/pipelines/mutations";
import { usePipelineUiStore } from "@/features/pipelines/stores/pipeline-ui-store";
import { usePermissions } from "@/hooks/use-permissions";

export function EditPipelineDialog() {
  const editPipelineId = usePipelineUiStore((s) => s.editPipelineId);
  const closeEditPipeline = usePipelineUiStore((s) => s.closeEditPipeline);
  const { data: listData } = usePipelines();
  const { data: pipelineDetail } = usePipeline(editPipelineId ?? undefined);
  const updatePipeline = useUpdatePipeline();
  const { can } = usePermissions();

  const pipeline =
    pipelineDetail ??
    listData?.items.find((item) => item.id === editPipelineId);
  const open = Boolean(editPipelineId && pipeline);

  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!pipeline) return;
    // Hydrating the form from the selected pipeline when the dialog opens
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(pipeline.name);
    setIsDefault(pipeline.isDefault);
  }, [pipeline]);

  const handleClose = () => {
    closeEditPipeline();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editPipelineId) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    await updatePipeline.mutateAsync({
      pipelineId: editPipelineId,
      input: {
        name: trimmed,
        isDefault,
      },
    });

    handleClose();
  };

  if (!can("pipeline.update")) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit pipeline</DialogTitle>
          <DialogDescription>Update pipeline name and default status.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-pipeline-name">Name</Label>
            <Input
              id="edit-pipeline-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isDefault}
              disabled={pipeline?.isDefault === true && isDefault}
              onCheckedChange={(checked) => setIsDefault(checked === true)}
            />
            <span>Default pipeline</span>
          </label>
          {pipeline?.isDefault ? (
            <p className="text-xs text-muted-foreground">
              Set another pipeline as default before unsetting this one.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updatePipeline.isPending || !name.trim()}
            >
              {updatePipeline.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
