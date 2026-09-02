"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { authApi } from "@/features/auth/api";
import { authToast } from "@/features/auth/utils/auth-toast";
import {
  isValidWorkspaceSlug,
  normalizeWorkspaceSlug,
} from "@/features/auth/utils/workspace-slug";
import { ApiError } from "@/lib/api/client";
import type { WorkspaceLookupResult } from "@/types/auth";

export type WorkspaceLookupStatus =
  | "idle"
  | "typing"
  | "checking"
  | "exists"
  | "missing"
  | "error";

const DEBOUNCE_MS = 500;

export function useWorkspaceLookup(rawSlug: string) {
  const t = useTranslations("auth.toast");
  const slug = normalizeWorkspaceSlug(rawSlug);
  const [status, setStatus] = useState<WorkspaceLookupStatus>("idle");
  const [workspace, setWorkspace] = useState<WorkspaceLookupResult | null>(null);

  useEffect(() => {
    authToast.dismissWorkspace();

    if (!slug) {
      // Derived status reset when the external slug input empties out
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("idle");
      setWorkspace(null);
      return;
    }

    if (slug.length < 2) {
      setStatus("typing");
      setWorkspace(null);
      return;
    }

    if (!isValidWorkspaceSlug(slug)) {
      setStatus("typing");
      setWorkspace(null);
      return;
    }

    setStatus("checking");
    setWorkspace(null);

    const timer = window.setTimeout(async () => {
      try {
        const result = await authApi.lookupWorkspace(slug);
        setWorkspace(result);
        setStatus("exists");
      } catch (error) {
        setWorkspace(null);
        if (error instanceof ApiError && error.status === 404) {
          setStatus("missing");
          authToast.workspaceNotFound({
            title: t("workspaceNotFoundTitle"),
            description: t("workspaceNotFoundDescription"),
          });
          return;
        }

        setStatus("error");
        authToast.workspaceLookupFailed({
          title: t("workspaceLookupFailedTitle"),
          description:
            error instanceof ApiError
              ? error.message
              : t("workspaceLookupFailedFallback"),
        });
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [slug, t]);

  return {
    slug,
    status,
    workspace,
  };
}
