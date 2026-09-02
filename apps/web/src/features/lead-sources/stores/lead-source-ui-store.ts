import { create } from "zustand";

interface LeadSourceUiState {
  createDialogOpen: boolean;
  editLeadSourceId: string | null;
  deleteLeadSourceId: string | null;
  highlightedLeadSourceId: string | null;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  openEditDialog: (leadSourceId: string) => void;
  closeEditDialog: () => void;
  openDeleteDialog: (leadSourceId: string) => void;
  closeDeleteDialog: () => void;
  setHighlightedLeadSourceId: (leadSourceId: string | null) => void;
}

export const useLeadSourceUiStore = create<LeadSourceUiState>((set) => ({
  createDialogOpen: false,
  editLeadSourceId: null,
  deleteLeadSourceId: null,
  highlightedLeadSourceId: null,
  openCreateDialog: () => set({ createDialogOpen: true }),
  closeCreateDialog: () => set({ createDialogOpen: false }),
  openEditDialog: (leadSourceId) => set({ editLeadSourceId: leadSourceId }),
  closeEditDialog: () => set({ editLeadSourceId: null }),
  openDeleteDialog: (leadSourceId) => set({ deleteLeadSourceId: leadSourceId }),
  closeDeleteDialog: () => set({ deleteLeadSourceId: null }),
  setHighlightedLeadSourceId: (leadSourceId) =>
    set({ highlightedLeadSourceId: leadSourceId }),
}));
