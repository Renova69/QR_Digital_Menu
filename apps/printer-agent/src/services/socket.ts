import { io, Socket } from 'socket.io-client';
import { AgentConfig } from '../store/config';
import { printJob } from './printer';

interface PrintJobPayload {
  jobId: string;
  orderId: string;
  tableNumber: number | string;
  items: Array<{ name: string; quantity: number; notes?: string }>;
  specialRequests?: string;
  stationName?: string;
}

type StatusListener = (status: string, detail?: string) => void;

let socket: Socket | null = null;
let onStatusChange: StatusListener | null = null;

function setStatus(status: string, detail?: string) {
  onStatusChange?.(status, detail);
}

export function startSocketService(
  config: AgentConfig,
  listener: StatusListener,
): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  onStatusChange = listener;
  setStatus('connecting');

  socket = io(config.serverUrl, {
    auth: { agentToken: config.agentToken },
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 30_000,
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    setStatus('connected', `Agent connected — ${config.stationName}`);
  });

  socket.on('disconnect', (reason: string) => {
    setStatus('disconnected', reason);
  });

  socket.on('connect_error', (err: Error) => {
    setStatus('error', err.message);
  });

  socket.on('print:job', async (payload: PrintJobPayload) => {
    setStatus('printing', `Order ${payload.orderId.slice(-8).toUpperCase()}`);
    try {
      await printJob(config.printerIp, config.printerPort, {
        orderId: payload.orderId,
        tableNumber: payload.tableNumber,
        items: payload.items,
        specialRequests: payload.specialRequests,
        stationName: payload.stationName ?? config.stationName,
      });
      socket?.emit('print:ack', { jobId: payload.jobId, success: true });
      setStatus('connected', 'Last print OK');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      socket?.emit('print:ack', {
        jobId: payload.jobId,
        success: false,
        error: message,
      });
      setStatus('connected', `Print failed: ${message}`);
    }
  });
}

export function stopSocketService(): void {
  socket?.disconnect();
  socket = null;
  onStatusChange = null;
}
