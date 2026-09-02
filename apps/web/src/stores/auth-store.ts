import { create } from "zustand";
import type { AuthStatus, AuthUser } from "@/types/auth";
import { clearSessionHint, setSessionHint } from "@/lib/session-hint";

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: AuthUser | null;
  permissions: Set<string>;

  setStatus: (status: AuthStatus) => void;
  setAccessToken: (accessToken: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  setPermissions: (permissions: Set<string>) => void;
  clearAuth: () => void;
}

const initialState = {
  status: "bootstrapping" as AuthStatus,
  accessToken: null,
  user: null,
  permissions: new Set<string>(),
};

export const useAuthStore = create<AuthState>((set) => ({
  ...initialState,

  setStatus: (status) => {
    // Keep the middleware session-hint cookie in sync with real auth state.
    if (status === "authenticated") setSessionHint();
    if (status === "unauthenticated") clearSessionHint();
    set({ status });
  },
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setPermissions: (permissions) => set({ permissions }),
  clearAuth: () => {
    clearSessionHint();
    set({
      status: "unauthenticated",
      accessToken: null,
      user: null,
      permissions: new Set<string>(),
    });
  },
}));
