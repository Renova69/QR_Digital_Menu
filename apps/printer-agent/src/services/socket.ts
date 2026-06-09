import { io, Socket } from 'socket.io-client';
import { AgentConfig } from '../store/config';
import { sendToPrinter } from './printer';

interface PrintJobPayload {
  jobId: string;
  ticket: string; // base64-encoded ESC/POS bytes built by backend
}

export type ConnectionStatus = 'connecting' | 'connected' | 'printing' | 'disconnected' | 'error';

export interface StatusUpdate {
  status: ConnectionStatus;
  message: string;     // short label shown in status card
  hint?: string;       // actionable guidance shown below message
}

type StatusListener = (update: StatusUpdate) => void;

const TAG = '[PrintAgent]';

// H-5: generation counter isolates callbacks when startSocketService is called again
// before the previous socket has fully closed (avoids module-level mutable state races)
let generation = 0;
let socket: Socket | null = null;
let onStatusChange: StatusListener | null = null;
let connectTimeoutId: ReturnType<typeof setTimeout> | null = null;

function emit(update: StatusUpdate) {
  if (__DEV__) {
    console.log(`${TAG} status=${update.status} msg="${update.message}"${update.hint ? ` hint="${update.hint}"` : ''}`);
  }
  onStatusChange?.(update);
}

function clearConnectTimeout() {
  if (connectTimeoutId !== null) {
    clearTimeout(connectTimeoutId);
    connectTimeoutId = null;
  }
}

function isPrivateServerUrl(url: string): boolean {
  return /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.)/i.test(url);
}

function classifyConnectError(err: Error, serverUrl: string): StatusUpdate {
  const msg = (err.message ?? '').toLowerCase();
  const raw = err.message || 'unknown error';
  const isLocal = isPrivateServerUrl(serverUrl);

  if (__DEV__) {
    console.log(`${TAG} connect_error raw="${raw}" local=${isLocal}`);
  }

  if (
    msg.includes('econnrefused') ||
    msg.includes('err_connection_refused') ||
    msg.includes('connection refused')
  ) {
    return {
      status: 'error',
      message: 'Server not running',
      hint: `Port is closed — check the backend is running.\n(${raw})`,
    };
  }

  if (
    msg.includes('etimedout') ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  ) {
    return {
      status: 'error',
      message: 'Connection timed out',
      hint: isLocal
        ? `Local server unreachable. Make sure your phone is on the same Wi-Fi as ${serverUrl}.\n(${raw})`
        : `Server not responding. Check the Server URL and your network.\n(${raw})`,
    };
  }

  if (msg.includes('cors')) {
    return {
      status: 'error',
      message: 'CORS rejected',
      hint: `Server refused the connection origin.\n(${raw})`,
    };
  }

  if (
    msg.includes('websocket') ||
    msg.includes('transport') ||
    msg.includes('xhr poll')
  ) {
    return {
      status: 'error',
      message: 'WebSocket error',
      hint: isLocal
        ? `Cannot reach local server. Ensure phone is on the same Wi-Fi as ${serverUrl}.\n(${raw})`
        : `WebSocket connection failed. If using https://, verify the server URL is correct.\n(${raw})`,
    };
  }

  if (msg.includes('network') || msg.includes('net::')) {
    return {
      status: 'error',
      message: 'Network error',
      hint: `No network connection. Check Wi-Fi or mobile data.\n(${raw})`,
    };
  }

  return {
    status: 'error',
    message: 'Connection failed',
    hint: `${raw}\nCheck Server URL and network.`,
  };
}

function classifyDisconnect(reason: string, authRejected: boolean): StatusUpdate {
  if (__DEV__) {
    console.log(`${TAG} disconnect reason="${reason}" authRejected=${authRejected}`);
  }

  if (authRejected) {
    return {
      status: 'error',
      message: 'Token rejected',
      hint: 'Agent token is invalid, revoked, or the station is disabled. Tap Reset & Reconfigure and generate a new token from the dashboard.',
    };
  }

  switch (reason) {
    case 'server namespace disconnect':
    case 'io server disconnect':
      return {
        status: 'disconnected',
        message: 'Disconnected by server',
        hint: 'Server closed the connection. If this keeps happening, regenerate the agent token.',
      };
    case 'ping timeout':
      return {
        status: 'disconnected',
        message: 'Server not responding',
        hint: 'Lost heartbeat with server. Reconnecting…',
      };
    case 'transport error':
      return {
        status: 'disconnected',
        message: 'Network dropped',
        hint: 'Wi-Fi connection lost. Reconnecting when network returns…',
      };
    case 'transport close':
      return {
        status: 'disconnected',
        message: 'Connection lost',
        hint: 'Reconnecting…',
      };
    default:
      return {
        status: 'disconnected',
        message: 'Disconnected',
        hint: `Reason: ${reason}. Reconnecting…`,
      };
  }
}

async function pingServer(serverUrl: string): Promise<'ok' | 'unreachable' | 'running'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${serverUrl}/api/v1/health`, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    // Any HTTP response means the server is up (even 404/403)
    return res.status < 500 ? 'ok' : 'running';
  } catch {
    return 'unreachable';
  }
}

export function startSocketService(config: AgentConfig, listener: StatusListener): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  clearConnectTimeout();
  onStatusChange = listener;

  // H-5: capture this generation so stale callbacks from the previous socket are ignored
  const myGeneration = ++generation;
  let authRejected = false;
  let healthChecked = false;

  if (__DEV__) {
    console.log(`${TAG} connecting to ${config.serverUrl} station="${config.stationName}"`);
  }

  emit({
    status: 'connecting',
    message: 'Connecting…',
    hint: `Reaching ${config.serverUrl}`,
  });

  socket = io(config.serverUrl, {
    auth: { agentToken: config.agentToken },
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 30_000,
    reconnectionAttempts: Infinity,
    timeout: 10_000,
    // Use polling→websocket (standard socket.io order): polling establishes the
    // session over HTTP first, then upgrades. If WebSocket upgrade is blocked,
    // it stays on polling — still functional for print jobs.
    transports: ['polling', 'websocket'],
  });

  // Timeout guard — if no connect within 12s, surface a helpful message
  connectTimeoutId = setTimeout(() => {
    connectTimeoutId = null; // M-6: clear stale handle before checking state
    if (myGeneration !== generation) return; // H-5: stale generation, ignore
    if (socket && !socket.connected) {
      if (__DEV__) {
        console.log(`${TAG} connect timeout — no response within 12s`);
      }
      emit({
        status: 'error',
        message: 'Connection timed out',
        hint: `No response from ${config.serverUrl} after 12s. Check:\n• Same Wi-Fi network?\n• Backend running?\n• Server URL correct?`,
      });
    }
  }, 12_000);

  socket.on('connect', () => {
    if (myGeneration !== generation) return;
    clearConnectTimeout();
    authRejected = false;
    if (__DEV__) {
      console.log(`${TAG} connected socketId=${socket?.id}`);
    }
    emit({
      status: 'connected',
      message: 'Online',
      hint: `${config.stationName} ready to print`,
    });
  });

  socket.on('agent:rejected', (reason: string) => {
    if (myGeneration !== generation) return;
    if (__DEV__) {
      console.log(`${TAG} agent:rejected reason="${reason}"`);
    }
    authRejected = true;
  });

  socket.on('disconnect', (reason: string) => {
    if (myGeneration !== generation) return;
    clearConnectTimeout();
    emit(classifyDisconnect(reason, authRejected));
  });

  socket.on('connect_error', (err: Error) => {
    if (myGeneration !== generation) return;
    clearConnectTimeout();

    if (!healthChecked) {
      // engine.io always emits the generic "websocket error" / "xhr poll error"
      // regardless of the actual cause (ECONNREFUSED, 403 CORS, unreachable host).
      // Ping the health endpoint once to distinguish "server down" from
      // "server up but connection rejected".
      healthChecked = true;
      void pingServer(config.serverUrl).then((reachability) => {
        if (myGeneration !== generation) return;
        if (reachability === 'unreachable') {
          emit({
            status: 'error',
            message: 'Server unreachable',
            hint: isPrivateServerUrl(config.serverUrl)
              ? `Cannot reach ${config.serverUrl}.\n• Is your phone on the same Wi-Fi?\n• Is the backend (npm run dev) running?`
              : `Cannot reach ${config.serverUrl}. Check the Server URL and your network.`,
          });
        } else {
          // Server is up — something rejected the socket connection (CORS, auth, etc.)
          emit(classifyConnectError(err, config.serverUrl));
        }
      });
    } else {
      emit(classifyConnectError(err, config.serverUrl));
    }
  });

  socket.on('reconnect_attempt', (attempt: number) => {
    if (myGeneration !== generation) return;
    if (__DEV__) {
      console.log(`${TAG} reconnect attempt #${attempt}`);
    }
    emit({
      status: 'connecting',
      message: `Reconnecting… (attempt ${attempt})`,
      hint: 'Waiting for network or server to come back.',
    });
  });

  socket.on('reconnect_failed', () => {
    if (myGeneration !== generation) return;
    if (__DEV__) {
      console.log(`${TAG} reconnect_failed — giving up`);
    }
    emit({
      status: 'error',
      message: 'Cannot reconnect',
      hint: 'All reconnection attempts failed. Tap Reset & Reconfigure to check your settings.',
    });
  });

  socket.on('print:job', (payload: PrintJobPayload) => {
    // Intentionally NOT async at the handler level — unhandled async rejections
    // crash Hermes in production builds. All async work is inside a caught promise.
    void (async () => {
      try {
        if (myGeneration !== generation) return;
        const jobId = payload?.jobId;
        const ticket = payload?.ticket;
        if (!jobId || !ticket) {
          if (__DEV__) {
            console.warn(`${TAG} print:job received with missing fields`, payload);
          }
          return;
        }

        const shortId = jobId.slice(-8).toUpperCase();
        if (__DEV__) {
          console.log(`${TAG} print:job jobId=${shortId} ticketBytes=${ticket.length}`);
        }
        emit({ status: 'printing', message: `Printing…`, hint: `Job ${shortId}` });

        // atob gives a binary string (each char = one byte 0-255) — pass directly
        // to sendToPrinter which writes with 'binary' encoding; no Buffer polyfill touched
        const binary = atob(ticket);
        if (__DEV__) {
          console.log(`${TAG} sending ${binary.length} bytes to ${config.printerIp}:${config.printerPort}`);
        }
        await sendToPrinter(config.printerIp, config.printerPort, binary);
        socket?.emit('print:ack', { jobId, success: true });
        emit({ status: 'connected', message: 'Online', hint: `Last print OK — job ${shortId}` });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (__DEV__) {
          console.error(`${TAG} printer error:`, message);
        }
        try {
          socket?.emit('print:ack', { jobId: payload?.jobId, success: false, error: message });
        } catch {}
        emit({
          status: 'connected',
          message: 'Print failed',
          hint: `${message}. Check printer IP ${config.printerIp}:${config.printerPort}.`,
        });
      }
    })();
  });
}

export function stopSocketService(): void {
  clearConnectTimeout();
  generation++; // H-5: invalidate all callbacks from the previous socket
  socket?.disconnect();
  socket = null;
  onStatusChange = null;
}
