import TcpSocket from 'react-native-tcp-socket';

export function sendToPrinter(
  ip: string,
  port: number,
  data: string, // raw binary string from atob() — each char = one ESC/POS byte
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutMs = 10_000;
    let resolved = false;
    let client: ReturnType<typeof TcpSocket.createConnection> | null = null;

    const done = (err?: Error) => {
      if (resolved) return;
      resolved = true;
      try {
        client?.destroy();
      } catch {}
      if (err) reject(err);
      else resolve();
    };

    const timer = setTimeout(() => done(new Error('Print timeout')), timeoutMs);

    client = TcpSocket.createConnection({ host: ip, port }, () => {
      clearTimeout(timer);
      // 'binary' encoding maps each char code directly to a byte — no Buffer
      // polyfill needed, avoiding the .buffer (ArrayBuffer) crash in Hermes
      client!.write(data, 'binary', (writeErr?: Error | null) => {
        if (writeErr) {
          done(writeErr);
        } else {
          client!.end();
          done();
        }
      });
    });

    client.on('error', (err: Error) => {
      clearTimeout(timer);
      done(err);
    });
  });
}
