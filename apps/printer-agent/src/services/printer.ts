import TcpSocket from 'react-native-tcp-socket';

export function sendToPrinter(
  ip: string,
  port: number,
  data: Uint8Array,
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
      client!.write(Buffer.from(data), undefined, (writeErr?: Error | null) => {
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
