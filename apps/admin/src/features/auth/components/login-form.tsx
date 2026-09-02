"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/features/auth/hooks/use-auth-actions";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, isSubmitting } = useLogin();

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !isSubmitting;

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          void login(email.trim(), password);
        }
      }}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("help")}
        </p>
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
              onChange={(event) => setEmail(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
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
