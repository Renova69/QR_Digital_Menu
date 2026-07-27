import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";

interface SocketContextData {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextData>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // Reconnect when auth identity changes so the handshake re-runs with the
  // current `token` cookie — dashboard room joins require an authed handshake.
  const { user, logout } = useAuth();
  const logoutRef = useRef(logout);
  const userId = user?.id ?? null;
  const socketDisabled = import.meta.env.VITE_DISABLE_SOCKET === "true";

  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  useEffect(() => {
    // Browser smoke tests exercise UI workflows with API boundaries stubbed.
    // Keeping Socket.IO disabled in that explicit environment prevents an
    // unrelated backend reconnect loop from leaking past Playwright teardown.
    if (socketDisabled) {
      setSocket(null);
      setIsConnected(false);
      return;
    }

    // Dev (incl. LAN IP testing): same-origin via Vite proxy. Production: connect
    // directly to backend. VITE_API_URL is the backend origin (e.g. https://api.example.com/api).
    // Must key off the actual build mode (import.meta.env.PROD), not hostname —
    // a hostname !== "localhost" check also misfires for LAN-IP dev testing
    // (e.g. 192.168.x.x:3001), routing the socket cross-origin where the dev
    // cookie doesn't attach, silently denying every room join (#SOCKET-C2).
    const socketUrl =
      import.meta.env.PROD && import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
        : undefined;

    const socketInstance = io(socketUrl, {
      autoConnect: true,
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socketInstance.on("connect", () => {
      console.log("Socket connected:", socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on("disconnect", () => {
      console.log("Socket disconnected");
      setIsConnected(false);
    });

    socketInstance.on(
      "roomError",
      (data: {
        room: string;
        error: string;
        restaurantId?: string;
        orderId?: string;
      }) => {
        // UNAUTHORIZED denials are the expected pre-auth race during bootstrap:
        // the socket connects before the auth cookie is established and retries
        // the room join once auth settles. Log those at debug to cut console
        // noise; surface anything else as a real warning.
        if (data.error === "UNAUTHORIZED") {
          console.debug("Socket room join deferred (pre-auth):", data.room);
        } else {
          console.warn("Socket room join denied:", data.room, data.error);
        }
        // A denied room join means the dashboard won't receive live events for
        // that room. The user sees the dashboard but updates never arrive (#SOCKET-C2).
        // In most cases this is transient (auth token just expired) — the socket
        // reconnects on the next auth state change and retries the room join.
      },
    );

    socketInstance.on("auth:evicted", (reason: string) => {
      console.warn("Socket auth evicted:", reason);
      if (reason === "device_revoked") {
        localStorage.removeItem("sharedDevice");
      }
      void logoutRef.current().finally(() => {
        window.location.assign(
          reason === "device_revoked" ||
            reason === "shared_device_mode_disabled"
            ? "/device-login"
            : "/login",
        );
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [socketDisabled, userId]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
