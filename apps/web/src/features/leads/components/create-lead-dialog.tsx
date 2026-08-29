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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDefaultPipelinePlacement,
  type FilterOption,
} from "@/features/leads/api";
import { useLeadFilterOptions } from "@/features/leads/hooks";
import { useCreateLead } from "@/features/leads/mutations";
import { useLeadUiStore } from "@/features/leads/stores/lead-ui-store";
import { INTEREST_LEVEL_OPTIONS } from "@/features/leads/utils/lead-filters";
import { usePermissions } from "@/hooks/use-permissions";

export function CreateLeadDialog() {
  const open = useLeadUiStore((s) => s.createDialogOpen);
  const closeCreateDialog = useLeadUiStore((s) => s.closeCreateDialog);
  const openDrawer = useLeadUiStore((s) => s.openDrawer);
  const { can } = usePermissions();
  const { pipelines, sources, users, projects } = useLeadFilterOptions();
  const createLeadMutation = useCreateLead();

  const [fullName, setFullName] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sourceId, setSourceId] = useState<string>();
  const [assignedUserId, setAssignedUserId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const [interestLevel, setInterestLevel] = useState<string>();
  const [pipelineId, setPipelineId] = useState<string>();
  const [pipelineStageId, setPipelineStageId] = useState<string>();

  const pipelineOptions = useMemo(() => pipelines.data ?? [], [pipelines.data]);

  const stageOptions = useMemo(() => {
    if (!pipelineId) return [];
    return (
      pipelineOptions
        .find((pipeline) => pipeline.id === pipelineId)
        ?.stages.map((stage) => ({ id: stage.id, name: stage.name })) ?? []
    );
  }, [pipelineId, pipelineOptions]);

  useEffect(() => {
    if (!open || pipelineOptions.length === 0) return;

    const placement = getDefaultPipelinePlacement(pipelineOptions);

    if (placement) {
      // Resetting form defaults when the dialog opens with freshly loaded pipelines
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPipelineId(placement.pipelineId);
      setPipelineStageId(placement.pipelineStageId);
    }
  }, [open, pipelineOptions]);

  const resetForm = () => {
    setFullName("");
    setPrimaryPhone("");
    setEmail("");
    setSourceId(undefined);
    setAssignedUserId(undefined);
    setProjectId(undefined);
    setInterestLevel(undefined);
  };

  const handleClose = () => {
    closeCreateDialog();
    resetForm();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pipelineId || !pipelineStageId) return;

    const result = await createLeadMutation.mutateAsync({
      fullName: fullName.trim(),
      primaryPhone: primaryPhone.trim(),
      email: email.trim() || null,
      pipelineId,
      pipelineStageId,
      ...(sourceId ? { sourceId } : {}),
      ...(assignedUserId ? { assignedUserId } : {}),
      ...(projectId
        ? {
            projectInterests: [
              {
                projectId,
                interestLevel:
                  interestLevel && interestLevel !== "__none__"
                    ? (interestLevel as "LOW" | "MEDIUM" | "HIGH" | "HOT")
                    : undefined,
              },
            ],
          }
        : {}),
    });

    handleClose();
    openDrawer(result.lead.id);
  };

  if (!can("lead.create")) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add lead</DialogTitle>
          <DialogDescription>
            Create a new lead in your default pipeline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lead-fullName">Full name</Label>
            <Input
              id="lead-fullName"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              minLength={2}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-phone">Primary phone</Label>
            <Input
              id="lead-phone"
              value={primaryPhone}
              onChange={(event) => setPrimaryPhone(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-email">Email</Label>
            <Input
              id="lead-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Pipeline"
              value={pipelineId}
              options={pipelineOptions}
              onChange={(value) => {
                setPipelineId(value);
                const pipeline = pipelineOptions.find(
                  (item) => item.id === value,
                );
                const firstStage = [...(pipeline?.stages ?? [])].sort(
                  (a, b) => a.sortOrder - b.sortOrder,
                )[0];
                setPipelineStageId(firstStage?.id);
              }}
            />
            <SelectField
              label="Stage"
              value={pipelineStageId}
              options={stageOptions}
              disabled={!pipelineId}
              onChange={setPipelineStageId}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Source"
              value={sourceId}
              options={sources.data ?? []}
              placeholder="Optional"
              onChange={setSourceId}
            />
            <SelectField
              label="Agent"
              value={assignedUserId}
              options={users.data ?? []}
              placeholder="Unassigned"
              onChange={setAssignedUserId}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Project"
              value={projectId}
              options={projects.data ?? []}
              placeholder="Optional"
              onChange={setProjectId}
            />
            <div className="space-y-2">
              <Label>Interest</Label>
              <Select
                value={interestLevel ?? "__none__"}
                disabled={!projectId}
                onValueChange={(next) =>
                  setInterestLevel(next === "__none__" ? undefined : next)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not set</SelectItem>
                  {INTEREST_LEVEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                createLeadMutation.isPending ||
                !fullName.trim() ||
                !primaryPhone.trim() ||
                !pipelineId ||
                !pipelineStageId
              }
            >
              {createLeadMutation.isPending ? "Creating..." : "Create lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SelectField({
  label,
  value,
  options,
  placeholder = "Select",
  disabled,
  onChange,
}: {
  label: string;
  value?: string;
  options: FilterOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value ?? "__none__"}
        disabled={disabled}
        onValueChange={(next) =>
          onChange(next === "__none__" ? undefined : next)
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
