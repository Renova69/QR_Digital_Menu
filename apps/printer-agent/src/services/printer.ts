import TcpSocket from 'react-native-tcp-socket';

interface PrintJob {
  orderId: string;
  tableNumber: number | string;
  items: Array<{ name: string; quantity: number; notes?: string }>;
  specialRequests?: string;
  stationName?: string;
}

// ESC/POS command bytes
const ESC = 0x1b;
const GS = 0x1d;

function cmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

const INIT = cmd(ESC, 0x40);
const CUT = cmd(GS, 0x56, 0x41, 0x10);
const BOLD_ON = cmd(ESC, 0x45, 0x01);
const BOLD_OFF = cmd(ESC, 0x45, 0x00);
const ALIGN_CENTER = cmd(ESC, 0x61, 0x01);
const ALIGN_LEFT = cmd(ESC, 0x61, 0x00);
const DOUBLE_HEIGHT_ON = cmd(ESC, 0x21, 0x10);
const DOUBLE_HEIGHT_OFF = cmd(ESC, 0x21, 0x00);
const LINE_FEED = cmd(0x0a);

function encodeText(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes.push(code < 256 ? code : 0x3f);
  }
  bytes.push(0x0a);
  return new Uint8Array(bytes);
}

function separator(): Uint8Array {
  return encodeText('--------------------------------');
}

export function buildTicket(job: PrintJob): Uint8Array {
  const chunks: Uint8Array[] = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    DOUBLE_HEIGHT_ON,
    encodeText(job.stationName ?? 'KITCHEN'),
    DOUBLE_HEIGHT_OFF,
    BOLD_OFF,
    ALIGN_LEFT,
    LINE_FEED,
    separator(),
    BOLD_ON,
    encodeText(`Table: ${job.tableNumber}`),
    encodeText(`Order: ${job.orderId.slice(-8).toUpperCase()}`),
    BOLD_OFF,
    separator(),
  ];

  for (const item of job.items) {
    const line = `${item.quantity}x ${item.name}`;
    chunks.push(encodeText(line));
    if (item.notes) {
      chunks.push(encodeText(`  >> ${item.notes}`));
    }
  }

  if (job.specialRequests) {
    chunks.push(separator());
    chunks.push(BOLD_ON);
    chunks.push(encodeText('Notes:'));
    chunks.push(BOLD_OFF);
    chunks.push(encodeText(job.specialRequests));
  }

  chunks.push(separator());
  chunks.push(LINE_FEED);
  chunks.push(LINE_FEED);
  chunks.push(LINE_FEED);
  chunks.push(CUT);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

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

export async function printJob(
  ip: string,
  port: number,
  job: PrintJob,
): Promise<void> {
  const ticket = buildTicket(job);
  await sendToPrinter(ip, port, ticket);
}
