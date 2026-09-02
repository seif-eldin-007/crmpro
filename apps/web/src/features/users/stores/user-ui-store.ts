import { create } from "zustand";

/** Destructive/irreversible user actions that require an explicit confirmation. */
export type ConfirmUserActionType =
  | "deactivate"
  | "reactivate"
  | "revokeSessions";

export interface ConfirmUserActionRequest {
  action: ConfirmUserActionType;
  userId: string;
  userName: string;
}

interface UserUiState {
  createDialogOpen: boolean;
  editUserId: string | null;
  changeRoleUserId: string | null;
  resetPasswordUserId: string | null;
  drawerUserId: string | null;
  highlightedUserId: string | null;
  confirmAction: ConfirmUserActionRequest | null;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  openEditDialog: (userId: string) => void;
  closeEditDialog: () => void;
  openChangeRoleDialog: (userId: string) => void;
  closeChangeRoleDialog: () => void;
  openResetPasswordDialog: (userId: string) => void;
  closeResetPasswordDialog: () => void;
  openDrawer: (userId: string) => void;
  closeDrawer: () => void;
  setHighlightedUserId: (userId: string | null) => void;
  openConfirmAction: (request: ConfirmUserActionRequest) => void;
  closeConfirmAction: () => void;
}

export const useUserUiStore = create<UserUiState>((set) => ({
  createDialogOpen: false,
  editUserId: null,
  changeRoleUserId: null,
  resetPasswordUserId: null,
  drawerUserId: null,
  highlightedUserId: null,
  confirmAction: null,
  openCreateDialog: () => set({ createDialogOpen: true }),
  closeCreateDialog: () => set({ createDialogOpen: false }),
  openEditDialog: (userId) => set({ editUserId: userId }),
  closeEditDialog: () => set({ editUserId: null }),
  openChangeRoleDialog: (userId) => set({ changeRoleUserId: userId }),
  closeChangeRoleDialog: () => set({ changeRoleUserId: null }),
  openResetPasswordDialog: (userId) => set({ resetPasswordUserId: userId }),
  closeResetPasswordDialog: () => set({ resetPasswordUserId: null }),
  openDrawer: (userId) =>
    set({ drawerUserId: userId, highlightedUserId: userId }),
  closeDrawer: () => set({ drawerUserId: null, highlightedUserId: null }),
  setHighlightedUserId: (userId) => set({ highlightedUserId: userId }),
  openConfirmAction: (request) => set({ confirmAction: request }),
  closeConfirmAction: () => set({ confirmAction: null }),
}));
