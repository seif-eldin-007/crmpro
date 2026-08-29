"use client";

import { useEffect, useMemo, useState } from "react";
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
import { usePipeline, usePipelines } from "@/features/pipelines/hooks";
import { useUpdateStage } from "@/features/pipelines/mutations";
import { usePipelineUiStore } from "@/features/pipelines/stores/pipeline-ui-store";
import { STAGE_COLOR_PRESETS } from "@/features/pipelines/utils/pipeline-stage";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

export function EditStageDialog() {
  const editStage = usePipelineUiStore((s) => s.editStage);
  const closeEditStage = usePipelineUiStore((s) => s.closeEditStage);
  const { data: listData } = usePipelines();
  const { data: pipelineDetail } = usePipeline(editStage?.pipelineId);
  const updateStage = useUpdateStage();
  const { can } = usePermissions();

  const pipeline =
    pipelineDetail ??
    listData?.items.find((item) => item.id === editStage?.pipelineId);
  const stage = pipeline?.stages.find((item) => item.id === editStage?.stageId);
  const open = Boolean(editStage && pipeline && stage);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(STAGE_COLOR_PRESETS[0]);

  useEffect(() => {
    if (!stage) return;
    // Hydrating the form from the selected stage when the dialog opens
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(stage.name);
    setColor(stage.color ?? STAGE_COLOR_PRESETS[0]);
  }, [stage]);

  const isSystem = stage?.isSystem ?? false;

  const handleClose = () => {
    closeEditStage();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editStage || !stage) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    await updateStage.mutateAsync({
      pipelineId: editStage.pipelineId,
      stageId: editStage.stageId,
      input: {
        name: trimmed,
        color,
      },
    });

    handleClose();
  };

  const description = useMemo(() => {
    if (!stage) return "";
    if (stage.closeType === "WON") return "Won stage — name and color only.";
    if (stage.closeType === "LOST") return "Lost stage — name and color only.";
    if (stage.isSystem) return "System stage — name and color only.";
    return "Update stage name and color.";
  }, [stage]);

  if (!can("pipeline.update")) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit stage</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-stage-name">Stage name</Label>
            <Input
              id="edit-stage-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {STAGE_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={cn(
                    "size-7 rounded-md border-2 transition-transform hover:scale-105",
                    color === preset
                      ? "border-foreground ring-2 ring-ring/30"
                      : "border-transparent",
                  )}
                  style={{ backgroundColor: preset }}
                  onClick={() => setColor(preset)}
                  aria-label={`Color ${preset}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-9 w-12 cursor-pointer p-1"
              />
              <Input
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>

          {isSystem ? (
            <p className="text-xs text-muted-foreground">
              System stages cannot be deleted or reordered when they are Won/Lost.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateStage.isPending || !name.trim()}
            >
              {updateStage.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
