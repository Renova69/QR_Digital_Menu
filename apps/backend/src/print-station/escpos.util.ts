const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: Buffer.from([ESC, 0x40]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
  DOUBLE_HEIGHT_ON: Buffer.from([ESC, 0x21, 0x10]),
  DOUBLE_HEIGHT_OFF: Buffer.from([ESC, 0x21, 0x00]),
  FEED_4: Buffer.from([ESC, 0x64, 0x04]),
  CUT: Buffer.from([GS, 0x56, 0x41, 0x00]),
};

function text(str: string): Buffer {
  return Buffer.from(str + '\n', 'utf8');
}

function divider(): Buffer {
  return text('--------------------------------');
}

export interface PrintItem {
  quantity: number;
  name: string;
  notes?: string | null;
  options?: string[];
}

export interface PrintTicket {
  stationName: string;
  orderShortId: string;
  tableName?: string | null;
  customerName: string;
  items: PrintItem[];
  timestamp: Date;
  specialRequests?: string | null;
}

export function buildEscPosTicket(ticket: PrintTicket): Buffer {
  const parts: Buffer[] = [
    CMD.INIT,
    CMD.ALIGN_CENTER,
    CMD.DOUBLE_HEIGHT_ON,
    text(ticket.stationName.toUpperCase()),
    CMD.DOUBLE_HEIGHT_OFF,
    CMD.BOLD_ON,
    text(`ORDER #${ticket.orderShortId}`),
    CMD.BOLD_OFF,
  ];

  if (ticket.tableName) {
    parts.push(text(`Table: ${ticket.tableName}`));
  }

  parts.push(text(ticket.customerName), CMD.ALIGN_LEFT, divider());

  if (ticket.specialRequests) {
    parts.push(CMD.BOLD_ON, text(`NOTE: ${ticket.specialRequests}`), CMD.BOLD_OFF, divider());
  }

  for (const item of ticket.items) {
    parts.push(CMD.BOLD_ON, text(`${item.quantity}x  ${item.name}`), CMD.BOLD_OFF);
    if (item.options && item.options.length > 0) {
      for (const opt of item.options) {
        parts.push(text(`   + ${opt}`));
      }
    }
    if (item.notes) {
      parts.push(text(`   >> ${item.notes}`));
    }
  }

  const time = ticket.timestamp.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  parts.push(divider(), CMD.ALIGN_CENTER, text(time), CMD.FEED_4, CMD.CUT);
  return Buffer.concat(parts);
}
