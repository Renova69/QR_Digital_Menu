import { io } from "socket.io-client";
import type { AgentConfig } from "../store/config";
import { sendToPrinter } from "./printer";
import {
  startSocketService,
  stopSocketService,
  type StatusUpdate,
} from "./socket";
import { acquireWakeLock, releaseWakeLock } from "./wakeLock";

jest.mock("socket.io-client", () => ({
  io: jest.fn(),
}));
jest.mock("./printer", () => ({
  sendToPrinter: jest.fn(),
}));
jest.mock("./wakeLock", () => ({
  acquireWakeLock: jest.fn(),
  releaseWakeLock: jest.fn(),
}));

type SocketHandler = (...args: never[]) => void;

function createSocketDouble() {
  const handlers: Record<string, SocketHandler> = {};
  const socket = {
    connected: false,
    id: "socket-1",
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
  };
  socket.on.mockImplementation((event: string, handler: SocketHandler) => {
    handlers[event] = handler;
    return socket;
  });

  return { handlers, socket };
}

const CONFIG: AgentConfig = {
  serverUrl: "https://menu.example.com",
  agentToken: "agent-token",
  printerIp: "192.168.1.50",
  printerPort: 9100,
  stationName: "Kitchen",
};

describe("printer socket service", () => {
  const ioMock = jest.mocked(io);
  const sendToPrinterMock = jest.mocked(sendToPrinter);
  const acquireWakeLockMock = jest.mocked(acquireWakeLock);
  const releaseWakeLockMock = jest.mocked(releaseWakeLock);

  beforeEach(() => {
    stopSocketService();
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    stopSocketService();
    jest.restoreAllMocks();
  });

  it("reports connecting and online states through the status listener", () => {
    const { handlers, socket } = createSocketDouble();
    ioMock.mockReturnValue(socket as never);
    const statuses: StatusUpdate[] = [];

    startSocketService(CONFIG, (status) => statuses.push(status));

    expect(statuses[0]).toEqual({
      status: "connecting",
      message: "Connecting…",
      hint: "Reaching https://menu.example.com",
    });
    expect(ioMock).toHaveBeenCalledWith(
      CONFIG.serverUrl,
      expect.objectContaining({
        auth: { agentToken: CONFIG.agentToken },
        transports: ["polling", "websocket"],
      }),
    );
    expect(acquireWakeLockMock).toHaveBeenCalledTimes(1);

    socket.connected = true;
    handlers.connect();

    expect(statuses.at(-1)).toEqual({
      status: "connected",
      message: "Online",
      hint: "Kitchen ready to print",
    });
    expect(acquireWakeLockMock).toHaveBeenCalledTimes(2);
    expect(releaseWakeLockMock).not.toHaveBeenCalled();
  });

  it("prints a valid job and acknowledges success to the server", async () => {
    const { handlers, socket } = createSocketDouble();
    ioMock.mockReturnValue(socket as never);
    sendToPrinterMock.mockResolvedValue();
    const statuses: StatusUpdate[] = [];
    startSocketService(CONFIG, (status) => statuses.push(status));

    handlers["print:job"]({
      jobId: "job-12345678",
      ticket: "VElDS0VU",
    } as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(sendToPrinterMock).toHaveBeenCalledWith(
      CONFIG.printerIp,
      CONFIG.printerPort,
      "TICKET",
    );
    expect(socket.emit).toHaveBeenCalledWith("print:ack", {
      jobId: "job-12345678",
      success: true,
    });
    expect(statuses.at(-1)).toEqual({
      status: "connected",
      message: "Online",
      hint: "Last print OK — job 12345678",
    });
  });

  it("acknowledges a failed print while keeping the agent available", async () => {
    const { handlers, socket } = createSocketDouble();
    ioMock.mockReturnValue(socket as never);
    sendToPrinterMock.mockRejectedValue(new Error("Paper out"));
    const statuses: StatusUpdate[] = [];
    startSocketService(CONFIG, (status) => statuses.push(status));

    handlers["print:job"]({
      jobId: "job-12345678",
      ticket: "VElDS0VU",
    } as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(socket.emit).toHaveBeenCalledWith("print:ack", {
      jobId: "job-12345678",
      success: false,
      error: "Paper out",
    });
    expect(statuses.at(-1)).toEqual({
      status: "connected",
      message: "Print failed",
      hint: "Paper out. Check printer IP 192.168.1.50:9100.",
    });
  });

  it("surfaces an authentication rejection and releases the wake lock", () => {
    const { handlers, socket } = createSocketDouble();
    ioMock.mockReturnValue(socket as never);
    const statuses: StatusUpdate[] = [];
    startSocketService(CONFIG, (status) => statuses.push(status));

    handlers["agent:rejected"]("revoked" as never);
    handlers.disconnect("io server disconnect" as never);

    expect(releaseWakeLockMock).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toEqual({
      status: "error",
      message: "Token rejected",
      hint: "Agent token is invalid, revoked, or the station is disabled. Tap Reset & Reconfigure and generate a new token from the dashboard.",
    });
  });

  it("ignores callbacks from a socket replaced by a newer service", () => {
    const first = createSocketDouble();
    const second = createSocketDouble();
    ioMock
      .mockReturnValueOnce(first.socket as never)
      .mockReturnValueOnce(second.socket as never);
    const firstStatuses: StatusUpdate[] = [];
    const secondStatuses: StatusUpdate[] = [];

    startSocketService(CONFIG, (status) => firstStatuses.push(status));
    startSocketService(
      { ...CONFIG, stationName: "Bar" },
      (status) => secondStatuses.push(status),
    );

    first.handlers.connect();
    second.handlers.connect();

    expect(first.socket.disconnect).toHaveBeenCalled();
    expect(firstStatuses).toHaveLength(1);
    expect(secondStatuses.at(-1)).toEqual({
      status: "connected",
      message: "Online",
      hint: "Bar ready to print",
    });
  });
});
