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
  audio.play().catch((err) => console.log("Audio play error:", err));
};

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
      }
      return;
    }

    // Next.js rewrite buffering breaks SSE, but for WebSockets we can use the direct URL
    // Socket.io defaults to polling then upgrades to websockets.
    const socketBase = process.env.NEXT_PUBLIC_SSE_URL?.replace('/api/v1', '') || process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '');
    const socketUrl = socketBase || "http://localhost:3000";

    const socket = io(socketUrl, {
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

    socket.on("connect", () => {
      console.log("WebSocket connected");
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

    socket.on("disconnect", (reason) => {
      console.log("WebSocket disconnected:", reason);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [status, accessToken, setSocket]);
}
