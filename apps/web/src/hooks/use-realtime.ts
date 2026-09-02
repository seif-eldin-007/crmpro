"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/stores/auth-store";
import { queryKeys } from "@/lib/query/query-keys";
import { useRealtimeStore } from "@/stores/realtime-store";

const playNotificationSound = () => {
  const audio = new Audio("/sounds/notification.mp3");
  audio.volume = 0.5;
  audio.play().catch(() => {
    // Autoplay can be blocked by the browser; a missed chime is not an error.
  });
};

/**
 * Resolves the realtime (socket.io) gateway origin.
 *
 * The Next rewrite proxies only `/api/*`, not `/socket.io/*`, so the socket needs
 * a real origin rather than the same-origin API path. Preference:
 *   1. NEXT_PUBLIC_SSE_URL (explicit realtime gateway)
 *   2. NEXT_PUBLIC_API_URL when absolute
 *   3. the current host (works when a reverse proxy routes /socket.io here)
 * Returns null when nothing is resolvable so realtime can fail loud instead of
 * silently dialing a hardcoded localhost port.
 */
function resolveSocketOrigin(): string | null {
  const toOrigin = (value: string): string | null => {
    const trimmed = value.replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");
    return /^https?:\/\//.test(trimmed) ? trimmed : null;
  };

  const sse = process.env.NEXT_PUBLIC_SSE_URL;
  if (sse) {
    const origin = toOrigin(sse);
    if (origin) return origin;
  }

  const api = process.env.NEXT_PUBLIC_API_URL;
  if (api) {
    const origin = toOrigin(api);
    if (origin) return origin;
  }

  // Relative API base (same-origin): requires /socket.io reachable on this host.
  if (typeof window !== "undefined") return window.location.origin;

  return null;
}

export function useRealtimeStream() {
  const queryClient = useQueryClient();
  const status = useAuthStore((state) => state.status);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setSocket = useRealtimeStore((state) => state.setSocket);

  // Use refs to avoid recreating the socket when QC changes
  const queryClientRef = useRef(queryClient);
  useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      return;
    }

    // The Next rewrite only proxies /api/*, not /socket.io/*, so the socket needs
    // a real gateway origin (see resolveSocketOrigin). No localhost fallback: a
    // misconfigured build must fail loud rather than silently hit a dev port.
    const socketOrigin = resolveSocketOrigin();
    if (!socketOrigin) {
      console.error(
        "[realtime] Could not resolve a socket origin. Set NEXT_PUBLIC_SSE_URL to the realtime gateway origin. Realtime is disabled.",
      );
      return;
    }

    const socket = io(socketOrigin, {
      auth: {
        token: accessToken
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity
    });

    socketRef.current = socket;
    setSocket(socket);

    // First `connect` is the initial handshake; any later one means the socket
    // dropped and reconnected, so backfill everything we may have missed.
    let hasConnected = false;
    socket.on("connect", () => {
      if (!hasConnected) {
        hasConnected = true;
        return;
      }
      void queryClientRef.current.invalidateQueries({ refetchType: "active" });
    });

    socket.on("invalidate", (payload) => {
      const qc = queryClientRef.current;
      if (!payload || !payload.entity) return;

      if (payload.entity === "notifications") {
        if (payload.actorId && payload.actorId !== useAuthStore.getState().user?.id) {
          playNotificationSound();
        }
        void qc.invalidateQueries({
          queryKey: queryKeys.notifications.all(),
          refetchType: "all",
        });
        void qc.invalidateQueries({
          queryKey: queryKeys.notifications.unreadCount(),
          refetchType: "all",
        });
      }

      if (payload.entity === "support-messages") {
        if (payload.actorId && payload.actorId !== useAuthStore.getState().user?.id) {
          playNotificationSound();
        }
        void qc.invalidateQueries({
          queryKey: queryKeys.support.all(),
          refetchType: "all",
        });
        void qc.invalidateQueries({
          queryKey: queryKeys.support.unreadCount(),
          refetchType: "all",
        });
      }
    });

    socket.on("connect_error", (err) => {
      console.error("WebSocket connection error:", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [status, accessToken, setSocket]);
}
