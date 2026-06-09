const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: Buffer.from([ESC, 0x40]),
  // ESC t 17 — select CP866 (DOS Cyrillic); required before any Cyrillic text
  CODEPAGE_CP866: Buffer.from([ESC, 0x74, 0x11]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
  DOUBLE_HEIGHT_ON: Buffer.from([ESC, 0x21, 0x10]),
  DOUBLE_HEIGHT_OFF: Buffer.from([ESC, 0x21, 0x00]),
  FEED_4: Buffer.from([ESC, 0x64, 0x04]),
  CUT: Buffer.from([GS, 0x56, 0x41, 0x00]),
};

// Unicode → Windows-1251 byte for Cyrillic characters.
// Escpresso maps ESC t 17 (code page "CP866") to Windows-1251 via encoding_rs,
// so we must send Windows-1251 bytes, not CP866 bytes.
const WIN1251: Record<string, number> = {
  А:0xC0,Б:0xC1,В:0xC2,Г:0xC3,Д:0xC4,Е:0xC5,Ж:0xC6,З:0xC7,
  И:0xC8,Й:0xC9,К:0xCA,Л:0xCB,М:0xCC,Н:0xCD,О:0xCE,П:0xCF,
  Р:0xD0,С:0xD1,Т:0xD2,У:0xD3,Ф:0xD4,Х:0xD5,Ц:0xD6,Ч:0xD7,
  Ш:0xD8,Щ:0xD9,Ъ:0xDA,Ы:0xDB,Ь:0xDC,Э:0xDD,Ю:0xDE,Я:0xDF,
  а:0xE0,б:0xE1,в:0xE2,г:0xE3,д:0xE4,е:0xE5,ж:0xE6,з:0xE7,
  и:0xE8,й:0xE9,к:0xEA,л:0xEB,м:0xEC,н:0xED,о:0xEE,п:0xEF,
  р:0xF0,с:0xF1,т:0xF2,у:0xF3,ф:0xF4,х:0xF5,ц:0xF6,ч:0xF7,
  ш:0xF8,щ:0xF9,ъ:0xFA,ы:0xFB,ь:0xFC,э:0xFD,ю:0xFE,я:0xFF,
  Ё:0xA8,ё:0xB8,
};

function text(str: string): Buffer {
  const src = str + '\n';
  const out = Buffer.alloc(src.length);
  for (let i = 0; i < src.length; i++) {
    const code = src.charCodeAt(i);
    if (code < 0x80) {
      out[i] = code; // ASCII passthrough
    } else {
      out[i] = WIN1251[src[i]] ?? 0x3f; // '?' for unmapped
    }
  }
  return out;
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
    CMD.CODEPAGE_CP866,
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
