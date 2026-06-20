import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextData {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextData>({ socket: null, isConnected: false });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // Reconnect when auth identity changes so the handshake re-runs with the
  // current `token` cookie — dashboard room joins require an authed handshake.
  const { user, logout } = useAuth();
  const logoutRef = useRef(logout);
  const userId = user?.id ?? null;

  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  useEffect(() => {
    // Dev: same-origin via Vite proxy. Production: connect directly to backend.
    // VITE_API_URL is the backend origin (e.g. https://api.example.com/api).
    // In production, the backend is on a different host — must pass URL explicitly.
    const socketUrl =
      typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
        : undefined;

    const socketInstance = io(socketUrl, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    socketInstance.on('roomError', (data: { room: string; error: string; restaurantId?: string; orderId?: string }) => {
      console.warn('Socket room join denied:', data.room, data.error);
      // A denied room join means the dashboard won't receive live events for
      // that room. The user sees the dashboard but updates never arrive (#SOCKET-C2).
      // In most cases this is transient (auth token just expired) — the socket
      // reconnects on the next auth state change and retries the room join.
    });

    socketInstance.on('auth:evicted', (reason: string) => {
      console.warn('Socket auth evicted:', reason);
      if (reason === 'device_revoked') {
        localStorage.removeItem('sharedDevice');
      }
      void logoutRef.current().finally(() => {
        window.location.assign(
          reason === 'device_revoked' || reason === 'shared_device_mode_disabled'
            ? '/device-login'
            : '/login',
        );
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [userId]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
