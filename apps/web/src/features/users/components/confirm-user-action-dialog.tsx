"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDeactivateUser,
  useReactivateUser,
  useRevokeUserSessions,
} from "@/features/users/mutations";
import {
  useUserUiStore,
  type ConfirmUserActionType,
} from "@/features/users/stores/user-ui-store";

function actionCopy(action: ConfirmUserActionType, userName: string) {
  switch (action) {
    case "deactivate":
      return {
        title: "Deactivate user?",
        description: `${userName} will be signed out and unable to sign in until reactivated. Their leads and records are kept.`,
        confirmLabel: "Deactivate",
        destructive: true,
      };
    case "reactivate":
      return {
        title: "Reactivate user?",
        description: `Restore sign-in access for ${userName}.`,
        confirmLabel: "Reactivate",
        destructive: false,
      };
    case "revokeSessions":
      return {
        title: "Revoke sessions?",
        description: `All active sessions for ${userName} will be signed out immediately. They can sign in again with their password.`,
        confirmLabel: "Revoke sessions",
        destructive: true,
      };
  }
}

/**
 * Single confirm dialog for destructive user actions (deactivate, reactivate,
 * revoke sessions). Driven by the user UI store so the row actions, context menu
 * and detail drawer all share one dialog — matching the admin tenant-actions
 * confirm pattern.
 */
export function ConfirmUserActionDialog() {
  const t = useTranslations("common");
  const confirmAction = useUserUiStore((s) => s.confirmAction);
  const closeConfirmAction = useUserUiStore((s) => s.closeConfirmAction);
  const deactivateUser = useDeactivateUser();
  const reactivateUser = useReactivateUser();
  const revokeSessions = useRevokeUserSessions();

  const open = confirmAction !== null;
  const pending =
    deactivateUser.isPending ||
    reactivateUser.isPending ||
    revokeSessions.isPending;
  const copy = confirmAction
    ? actionCopy(confirmAction.action, confirmAction.userName)
    : null;

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { action, userId } = confirmAction;
    try {
      if (action === "deactivate") {
        await deactivateUser.mutateAsync(userId);
      } else if (action === "reactivate") {
        await reactivateUser.mutateAsync(userId);
      } else {
        await revokeSessions.mutateAsync(userId);
      }
      closeConfirmAction();
    } catch {
      // Error toast is surfaced by useApiMutation; keep the dialog open to retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeConfirmAction()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeConfirmAction}
            disabled={pending}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant={copy?.destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() => void handleConfirm()}
          >
            {pending ? t("working") : copy?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
