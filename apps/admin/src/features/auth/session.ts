import { authApi } from "@/features/auth/api";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Bootstraps the session from the httpOnly refresh cookie. The cookie is not
 * readable from JS, so we simply attempt a silent refresh — a 401 means there
 * is no (valid) session.
 */
export async function hydrateAuthSession(): Promise<boolean> {
  const store = useAuthStore.getState();

  const { accessToken } = await authApi.refresh();
  store.setAccessToken(accessToken);

  try {
    const [user, authorization] = await Promise.all([
      authApi.me(),
      authApi.permissions(),
    ]);

    store.setUser(user);
    store.setRole(authorization.role);
    store.setPermissions(new Set(authorization.permissions));
    store.setStatus("authenticated");
    return true;
  } catch (error) {
    store.clearAuth();
    throw error;
  }
}

export async function hydrateAuthAfterLogin(accessToken: string): Promise<void> {
  const store = useAuthStore.getState();
  store.setAccessToken(accessToken);

  try {
    const [user, authorization] = await Promise.all([
      authApi.me(),
      authApi.permissions(),
    ]);

    store.setUser(user);
    store.setRole(authorization.role);
    store.setPermissions(new Set(authorization.permissions));
    store.setStatus("authenticated");
  } catch (error) {
    store.clearAuth();
    throw error;
  }
}
