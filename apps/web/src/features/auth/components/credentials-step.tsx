"use client";

import { useTranslations } from "next-intl";
import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkspaceLookupResult } from "@/types/auth";

interface CredentialsStepProps {
  workspace: WorkspaceLookupResult;
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function CredentialsStep({
  workspace,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onBack,
  onSubmit,
  isSubmitting,
}: CredentialsStepProps) {
  const t = useTranslations("auth.login");
  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          onSubmit();
        }
      }}
    >
      <div className="space-y-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          onClick={onBack}
          disabled={isSubmitting}
        >
          <AppIcons.arrowLeft className="size-4" stroke={2} />
          {t("back")}
        </Button>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <AppIcons.building className="size-4" stroke={1.75} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{workspace.name}</p>
              <p className="truncate text-xs text-muted-foreground">{workspace.slug}</p>
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">{t("credentialsHeading")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("credentialsHelp")}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t("emailLabel")}</Label>
          <div className="relative">
            <AppIcons.mail
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              stroke={1.75}
            />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
              autoFocus
              disabled={isSubmitting}
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("passwordLabel")}</Label>
          <div className="relative">
            <AppIcons.lock
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              stroke={1.75}
            />
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder={t("passwordPlaceholder")}
              autoComplete="current-password"
              disabled={isSubmitting}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {isSubmitting ? (
          <>
            <AppIcons.loader className="size-4 animate-spin" stroke={2} />
            {t("signingIn")}
          </>
        ) : (
          <>
            {t("signIn")}
            <AppIcons.arrowRight className="size-4" stroke={2} />
          </>
        )}
      </Button>
    </form>
  );
}
