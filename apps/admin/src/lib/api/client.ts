import type { ApiResponse } from "@/types/api";
import { useAuthStore } from "@/stores/auth-store";
import { getQueryClient } from "@/lib/query/query-client";
import { resolveApiBaseUrl } from "@/lib/api/resolve-api-base-url";

/**
 * Normalized API error thrown by the client for any non-success response.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(params: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.code = params.code;
    this.status = params.status;
    this.details = params.details ?? null;
  }
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuth?: boolean;
  skipRefresh?: boolean;
  _isRetry?: boolean;
}

let refreshPromise: Promise<string> | null = null;

export function handleAuthFailure(): void {
  useAuthStore.getState().clearAuth();
  getQueryClient()?.clear();

  if (typeof window !== "undefined") {
    const onLoginRoute = window.location.pathname.startsWith("/login");
    if (!onLoginRoute) {
      window.location.assign("/login");
    }
  }
}

/**
 * Silent refresh via the httpOnly refresh cookie (same-origin proxy).
 * Single-flight: concurrent 401s share one refresh request.
 */
async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(buildUrl("/auth/refresh"), {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "include",
        cache: "no-store",
      });

      const { accessToken } = await parseEnvelope<{ accessToken: string }>(
        response,
      );

      useAuthStore.getState().setAccessToken(accessToken);
      return accessToken;
    } catch (error) {
      handleAuthFailure();
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const baseUrl = resolveApiBaseUrl();
  const url = new URL(normalizedPath, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    if (!response.ok) {
      throw new ApiError({
        code: "UNEXPECTED_RESPONSE",
        message: `Request failed with status ${response.status}`,
        status: response.status,
      });
    }
    return undefined as T;
  }

  if (!response.ok || !payload.success) {
    const error =
      payload && payload.success === false ? payload.error : undefined;
    throw new ApiError({
      code: error?.code ?? "UNKNOWN_ERROR",
      message: error?.message ?? "Something went wrong.",
      status: response.status,
      details: error?.details,
    });
  }

  return payload.data;
}

async function executeRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const accessToken = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (!options.skipAuth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
      signal: options.signal,
    });
  } catch (cause) {
    throw new ApiError({
      code: "NETWORK_ERROR",
      message: "Unable to reach the server. Check your connection.",
      status: 0,
      details: cause,
    });
  }

  if (
    response.status === 401 &&
    !options.skipRefresh &&
    !options._isRetry
  ) {
    await refreshAccessToken();
    return executeRequest<T>(method, path, body, {
      ...options,
      _isRetry: true,
    });
  }

  return parseEnvelope<T>(response);
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    executeRequest<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    executeRequest<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    executeRequest<T>("PATCH", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    executeRequest<T>("DELETE", path, undefined, options),
};
