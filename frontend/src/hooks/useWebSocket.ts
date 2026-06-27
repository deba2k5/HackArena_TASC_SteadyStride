import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const WS_URL = (import.meta.env.VITE_WS_URL as string | undefined) || "http://localhost:5000";

let globalSocket: Socket | null = null;

/**
 * Initialize and return the global socket connection.
 * Ensures only one connection is created.
 */
export function getSocket(userEmail?: string): Socket {
  if (!globalSocket) {
    globalSocket = io(WS_URL, {
      query: { email: userEmail || "anonymous" },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    globalSocket.on("connect", () => {
      console.log("WebSocket connected:", globalSocket?.id);
    });

    globalSocket.on("disconnect", () => {
      console.log("WebSocket disconnected");
    });

    globalSocket.on("connect_error", (error) => {
      console.warn("WebSocket connection error:", error);
    });
  }

  return globalSocket;
}

/**
 * Hook to listen to real-time session updates.
 */
export function useSessionUpdates(
  onSessionCreated?: (session: any) => void,
  onSessionUpdated?: (session: any) => void
) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = getSocket();

    if (onSessionCreated) {
      socketRef.current.on("session_created", onSessionCreated);
    }

    if (onSessionUpdated) {
      socketRef.current.on("session_updated", onSessionUpdated);
      socketRef.current.on("session_real_time_update", onSessionUpdated);
    }

    return () => {
      if (onSessionCreated) {
        socketRef.current?.off("session_created", onSessionCreated);
      }
      if (onSessionUpdated) {
        socketRef.current?.off("session_updated", onSessionUpdated);
        socketRef.current?.off("session_real_time_update", onSessionUpdated);
      }
    };
  }, [onSessionCreated, onSessionUpdated]);
}

/**
 * Hook to listen to real-time profile updates.
 */
export function useProfileUpdates(
  onProfileUpdated?: (profile: any) => void
) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = getSocket();

    if (onProfileUpdated) {
      socketRef.current.on("profile_updated", onProfileUpdated);
      socketRef.current.on("profile_real_time_update", onProfileUpdated);
    }

    return () => {
      if (onProfileUpdated) {
        socketRef.current?.off("profile_updated", onProfileUpdated);
        socketRef.current?.off("profile_real_time_update", onProfileUpdated);
      }
    };
  }, [onProfileUpdated]);
}

/**
 * Hook to listen to audit log updates.
 */
export function useAuditUpdates(
  onAuditLogCreated?: (log: any) => void
) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = getSocket();

    if (onAuditLogCreated) {
      socketRef.current.on("audit_log_created", onAuditLogCreated);
    }

    return () => {
      if (onAuditLogCreated) {
        socketRef.current?.off("audit_log_created", onAuditLogCreated);
      }
    };
  }, [onAuditLogCreated]);
}

/**
 * Hook to join admin room (for admin dashboard).
 */
export function useAdminRoom(userEmail?: string) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = getSocket(userEmail);
    socketRef.current.emit("join_admin_room");

    return () => {
      // Optional: leave admin room on unmount
    };
  }, [userEmail]);
}

/**
 * Broadcast a session update to all connected clients.
 */
export function broadcastSessionUpdate(data: any) {
  const socket = getSocket();
  socket.emit("session_update", data);
}

/**
 * Broadcast a profile update to all connected clients.
 */
export function broadcastProfileUpdate(data: any) {
  const socket = getSocket();
  socket.emit("profile_update", data);
}

/**
 * Disconnect the global socket connection.
 */
export function disconnectSocket() {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
  }
}
