import { apiClient } from "@/lib/api/client";
import type { AdminAuthorization, AuthUser } from "@/types/auth";

export interface LoginPayload {
  email: string;
  password: string;
  deviceName?: string;
}

export interface LoginResult {
  accessToken: string;
  admin: AuthUser;
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  // The refresh token is stored in an httpOnly cookie by the API; the client
  // only receives the short-lived access token.
  return apiClient.post<LoginResult>("/auth/login", payload);
}

export async function refreshSession(): Promise<{ accessToken: string }> {
  return apiClient.post<{ accessToken: string }>("/auth/refresh", undefined, {
    skipAuth: true,
    skipRefresh: true,
  });
}

export function logout() {
  return apiClient.post<{ message?: string }>("/auth/logout");
}

export function logoutAllSessions() {
  return apiClient.post<{ revokedSessions: number }>("/auth/logout-all");
}

export function getCurrentUser() {
  return apiClient.get<AuthUser>("/auth/me");
}

export function getPermissions() {
  return apiClient.get<AdminAuthorization>("/auth/permissions");
}

export interface AuthSession {
  id: string;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export function getSessions() {
  return apiClient.get<{ items: AuthSession[] }>("/auth/sessions");
}

export const authApi = {
  login,
  refresh: refreshSession,
  logout,
  logoutAll: logoutAllSessions,
  me: getCurrentUser,
  permissions: getPermissions,
  sessions: getSessions,
};
