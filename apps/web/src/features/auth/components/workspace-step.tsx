"use client";

import { useTranslations } from "next-intl";
import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { WorkspaceLookupStatus } from "@/features/auth/hooks/use-workspace-lookup";
import type { WorkspaceLookupResult } from "@/types/auth";

interface WorkspaceStepProps {
  slugInput: string;
  onSlugChange: (value: string) => void;
  status: WorkspaceLookupStatus;
  workspace: WorkspaceLookupResult | null;
  onContinue: () => void;
}

export function WorkspaceStep({
  slugInput,
  onSlugChange,
  status,
  workspace,
  onContinue,
}: WorkspaceStepProps) {
  const t = useTranslations("auth.login");
  const canContinue = status === "exists" && workspace !== null;
  const showMissing = status === "missing";
  const showExists = status === "exists" && workspace;
  const showChecking = status === "checking";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <AppIcons.building className="size-4" stroke={1.75} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{t("workspaceHeading")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("workspaceHelp")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workspace-slug">{t("workspaceSlugLabel")}</Label>
        <div className="relative">
          <AppIcons.building
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            stroke={1.75}
          />
          <Input
            id="workspace-slug"
            value={slugInput}
            onChange={(event) => onSlugChange(event.target.value)}
            placeholder="prime-estates"
            autoComplete="organization"
            autoFocus
            spellCheck={false}
            aria-invalid={showMissing}
            className={cn(
              "pl-9 pr-10",
              showExists &&
                "border-emerald-500/70 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20",
              showMissing &&
                "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
            )}
          />
          {showChecking && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
              <AppIcons.loader className="size-4 animate-spin" stroke={2} />
            </span>
          )}
          {showExists && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-emerald-600 dark:text-emerald-400">
              <AppIcons.check className="size-4" stroke={2.5} />
            </span>
          )}
          {showMissing && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-destructive">
              <AppIcons.alertCircle className="size-4" stroke={2} />
            </span>
          )}
        </div>

        {showExists && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5">
            <AppIcons.check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" stroke={2.5} />
            <span className="truncate text-sm font-medium text-emerald-800 dark:text-emerald-300">
              {workspace.name}
            </span>
          </div>
        )}
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={!canContinue || showChecking}
        onClick={onContinue}
      >
        {t("continue")}
        <AppIcons.arrowRight className="size-4" stroke={2} />
      </Button>
    </div>
  );
}
