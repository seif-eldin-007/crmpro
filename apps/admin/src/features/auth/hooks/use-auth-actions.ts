"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { authApi } from "@/features/auth/api";
import { hydrateAuthAfterLogin } from "@/features/auth/session";
import { getQueryClient } from "@/lib/query/query-client";
import { useAuthStore } from "@/stores/auth-store";

export function useLogin() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const t = useTranslations("auth.toast");

  async function login(email: string, password: string) {
    setIsSubmitting(true);
    try {
      const result = await authApi.login({ email, password });
      await hydrateAuthAfterLogin(result.accessToken);
      toast.success(t("signInSuccessTitle"));
      router.replace("/dashboard");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : t("signInFailedFallback");
      toast.error(message);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  return { login, isSubmitting };
}

export function useLogout() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const router = useRouter();

  async function logout() {
    setIsLoggingOut(true);
    try {
      await authApi.logout();
    } catch {
      // Clear local session even if the API call fails.
    } finally {
      clearAuth();
      getQueryClient()?.clear();
      setIsLoggingOut(false);
      router.replace("/login");
    }
  }

  return { logout, isLoggingOut };
}
