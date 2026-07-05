import { useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";

export interface ReservationUpdatedPayload {
  id: string;
  status: string;
}

export function useReservationRealtime(
  restaurantId: string,
  manageToken: string,
  onUpdate: (payload: ReservationUpdatedPayload) => void,
) {
  const { socket, isConnected } = useSocket();
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!socket || !isConnected || !restaurantId || !manageToken) return;

    const credentials = { restaurantId, token: manageToken };
    const handleUpdate = (payload: ReservationUpdatedPayload) => {
      onUpdateRef.current(payload);
    };

    // Listen before joining because the server immediately sends the current
    // status after authorizing the room, closing the initial-load race window.
    socket.on("reservation:updated", handleUpdate);
    socket.emit("joinReservationRoom", credentials);

    return () => {
      socket.off("reservation:updated", handleUpdate);
      socket.emit("leaveReservationRoom", credentials);
    };
  }, [socket, isConnected, restaurantId, manageToken]);
}
