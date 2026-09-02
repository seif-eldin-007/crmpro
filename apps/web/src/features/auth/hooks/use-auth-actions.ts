"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authApi } from "@/features/auth/api";
import { hydrateAuthAfterLogin } from "@/features/auth/session";
import { authToast } from "@/features/auth/utils/auth-toast";
import { ApiError } from "@/lib/api/client";
import { getQueryClient } from "@/lib/query/query-client";
import { useAuthStore } from "@/stores/auth-store";

export function useLogout() {
  const router = useRouter();
  const t = useTranslations("auth.toast");
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await authApi.logout();
    } catch {
      // Clear local session even when the network call fails.
    } finally {
      clearAuth();
      getQueryClient()?.clear();
      setIsLoggingOut(false);
      authToast.signedOut({
        title: t("signedOutTitle"),
        description: t("signedOutDescription"),
      });
      router.replace("/login");
    }
  }, [clearAuth, router, t]);

  return { logout, isLoggingOut };
}

export function useLogin() {
  const router = useRouter();
  const t = useTranslations("auth.toast");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const login = useCallback(
    async (payload: {
      tenantSlug: string;
      email: string;
      password: string;
    }) => {
      setIsSubmitting(true);
      authToast.dismissSignIn();

      try {
        const result = await authApi.login({
          ...payload,
          deviceName: "CRM Web",
        });
        await hydrateAuthAfterLogin(result.accessToken);
        authToast.signInSuccess({
          title: t("signInSuccessTitle"),
          description: t("signInSuccessDescription", { name: result.user.name }),
        });
        router.replace("/dashboard");
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : t("signInFailedFallback");
        authToast.signInFailed({
          title: t("signInFailedTitle"),
          description: message,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [router, t],
  );

  return { login, isSubmitting };
}
