"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthSplash } from "@/features/auth/components/auth-splash";
import { LoginForm } from "@/features/auth/components/login-form";
import { useAuthStore } from "@/stores/auth-store";

export function LoginPageClient() {
  const router = useRouter();
  const t = useTranslations("auth");
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  if (status === "bootstrapping") {
    return <AuthSplash />;
  }

  if (status === "authenticated") {
    return <AuthSplash message={t("splash.openingDashboard")} />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-[400px] rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-xs">
            A
          </div>
          <div>
            <span className="text-lg font-semibold tracking-tight">Control Center</span>
            <p className="text-xs text-muted-foreground">{t("login.subtitle")}</p>
          </div>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
