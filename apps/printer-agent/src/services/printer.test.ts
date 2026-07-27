import TcpSocket from "react-native-tcp-socket";
import { sendToPrinter } from "./printer";

jest.mock("react-native-tcp-socket", () => ({
  __esModule: true,
  default: {
    createConnection: jest.fn(),
  },
}));

type SocketHandler = (error: Error) => void;

function createSocketDouble() {
  const handlers: Record<string, SocketHandler> = {};
  const client = {
    destroy: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    write: jest.fn(
      (
        _data: string,
        _encoding: string,
        callback: (error?: Error | null) => void,
      ) => callback(),
    ),
  };
  client.on.mockImplementation((event: string, handler: SocketHandler) => {
    handlers[event] = handler;
    return client;
  });

  return { client, handlers };
}

describe("sendToPrinter", () => {
  const createConnection = jest.mocked(TcpSocket.createConnection);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("delivers the binary ticket and closes the TCP connection", async () => {
    const { client } = createSocketDouble();
    let connected: (() => void) | undefined;
    createConnection.mockImplementation((_options, callback) => {
      connected = callback;
      return client as never;
    });

    const result = sendToPrinter("192.168.1.50", 9100, "\x1b@Test");
    connected?.();

    await expect(result).resolves.toBeUndefined();
    expect(createConnection).toHaveBeenCalledWith(
      { host: "192.168.1.50", port: 9100 },
      expect.any(Function),
    );
    expect(client.write).toHaveBeenCalledWith(
      "\x1b@Test",
      "binary",
      expect.any(Function),
    );
    expect(client.end).toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalled();
  });

  it("reports a printer write failure and still destroys the connection", async () => {
    const { client } = createSocketDouble();
    const writeError = new Error("Printer rejected the ticket");
    client.write.mockImplementation(
      (
        _data: string,
        _encoding: string,
        callback: (error?: Error | null) => void,
      ) => callback(writeError),
    );
    let connected: (() => void) | undefined;
    createConnection.mockImplementation((_options, callback) => {
      connected = callback;
      return client as never;
    });

    const result = sendToPrinter("192.168.1.50", 9100, "ticket");
    connected?.();

    await expect(result).rejects.toThrow("Printer rejected the ticket");
    expect(client.end).not.toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalled();
  });

  it("reports a TCP socket error before printing", async () => {
    const { client, handlers } = createSocketDouble();
    createConnection.mockReturnValue(client as never);

    const result = sendToPrinter("192.168.1.50", 9100, "ticket");
    handlers.error(new Error("Host unreachable"));

    await expect(result).rejects.toThrow("Host unreachable");
    expect(client.write).not.toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalled();
  });

  it("times out a printer that never completes its connection", async () => {
    jest.useFakeTimers();
    const { client } = createSocketDouble();
    createConnection.mockReturnValue(client as never);

    const result = sendToPrinter("192.168.1.50", 9100, "ticket");
    const rejection = expect(result).rejects.toThrow("Print timeout");
    jest.advanceTimersByTime(10_000);

    await rejection;
    expect(client.destroy).toHaveBeenCalled();
  });
});
