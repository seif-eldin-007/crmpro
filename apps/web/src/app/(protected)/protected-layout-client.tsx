"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/app-shell";
import { AuthSplash } from "@/features/auth/components/auth-splash";
import { findRouteByPath } from "@/config/routes";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuthStore } from "@/stores/auth-store";

export function ProtectedLayoutClient({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const { canAccessRoute } = usePermissions();
  const t = useTranslations("auth.splash");

  // Routes absent from the config (or before auth resolves) are not gated here;
  // the sidebar/palette only ever surface configured routes.
  const route = status === "authenticated" ? findRouteByPath(pathname) : undefined;
  const denied = route ? !canAccessRoute(route) : false;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  useEffect(() => {
    if (denied) {
      router.replace("/403");
    }
  }, [denied, router]);

  if (status === "bootstrapping") {
    return <AuthSplash />;
  }

  if (status === "unauthenticated") {
    return <AuthSplash message={t("redirecting")} />;
  }

  if (denied) {
    return <AuthSplash message={t("checkingPermissions")} />;
  }

  return <AppShell>{children}</AppShell>;
}
