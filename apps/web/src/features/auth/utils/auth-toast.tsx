import { createElement } from "react";
import { toast } from "sonner";
import { AppIcons } from "@/components/icons/app-icons";

const TOAST_ICON_PROPS = { className: "size-4", stroke: 2 } as const;

/** Pre-translated copy for a toast, built by callers via `useTranslations`. */
export interface ToastCopy {
  title: string;
  description?: string;
}

export const authToast = {
  workspaceNotFound(copy: ToastCopy) {
    toast.error(copy.title, {
      id: "workspace-lookup",
      description: copy.description,
      icon: createElement(AppIcons.buildingOff, TOAST_ICON_PROPS),
    });
  },

  workspaceLookupFailed(copy: ToastCopy) {
    toast.error(copy.title, {
      id: "workspace-lookup",
      description: copy.description,
      icon: createElement(AppIcons.alertCircle, TOAST_ICON_PROPS),
    });
  },

  signInFailed(copy: ToastCopy) {
    toast.error(copy.title, {
      id: "auth-sign-in",
      description: copy.description,
      icon: createElement(AppIcons.alertCircle, TOAST_ICON_PROPS),
    });
  },

  signInSuccess(copy: ToastCopy) {
    toast.success(copy.title, {
      id: "auth-sign-in",
      description: copy.description,
      icon: createElement(AppIcons.check, TOAST_ICON_PROPS),
    });
  },

  signedOut(copy: ToastCopy) {
    toast.info(copy.title, {
      id: "auth-sign-out",
      description: copy.description,
      icon: createElement(AppIcons.logout, TOAST_ICON_PROPS),
    });
  },

  dismissWorkspace() {
    toast.dismiss("workspace-lookup");
  },

  dismissSignIn() {
    toast.dismiss("auth-sign-in");
  },
};
