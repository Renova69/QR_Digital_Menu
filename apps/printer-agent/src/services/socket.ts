import { io, Socket } from 'socket.io-client';
import { AgentConfig } from '../store/config';
import { sendToPrinter } from './printer';

interface PrintJobPayload {
  jobId: string;
  ticket: string; // base64-encoded ESC/POS bytes built by backend
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
    const jobId = payload?.jobId;
    const ticket = payload?.ticket;
    if (!jobId || !ticket) return;

    setStatus('printing', `Job ${jobId.slice(-8).toUpperCase()}`);

    try {
      const bytes = new Uint8Array(Buffer.from(ticket, 'base64'));
      await sendToPrinter(config.printerIp, config.printerPort, bytes);
      socket?.emit('print:ack', { jobId, success: true });
      setStatus('connected', `Last print OK — job ${jobId.slice(-8).toUpperCase()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      socket?.emit('print:ack', { jobId, success: false, error: message });
      setStatus('connected', `Print failed: ${message}`);
    }
  });
}

export function stopSocketService(): void {
  socket?.disconnect();
  socket = null;
  onStatusChange = null;
}
