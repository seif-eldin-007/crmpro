"use client";

import { useTranslations } from "next-intl";

export function AuthSplash({ message }: { message?: string }) {
  const t = useTranslations("auth.splash");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
        C
      </div>
      <p className="mt-5 text-lg font-semibold tracking-tight">CRMPro</p>
      <p className="mt-2 text-sm text-muted-foreground">{message ?? t("loading")}</p>
    </div>
  );
}
