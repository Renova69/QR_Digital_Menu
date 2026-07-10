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
  А: 0xc0,
  Б: 0xc1,
  В: 0xc2,
  Г: 0xc3,
  Д: 0xc4,
  Е: 0xc5,
  Ж: 0xc6,
  З: 0xc7,
  И: 0xc8,
  Й: 0xc9,
  К: 0xca,
  Л: 0xcb,
  М: 0xcc,
  Н: 0xcd,
  О: 0xce,
  П: 0xcf,
  Р: 0xd0,
  С: 0xd1,
  Т: 0xd2,
  У: 0xd3,
  Ф: 0xd4,
  Х: 0xd5,
  Ц: 0xd6,
  Ч: 0xd7,
  Ш: 0xd8,
  Щ: 0xd9,
  Ъ: 0xda,
  Ы: 0xdb,
  Ь: 0xdc,
  Э: 0xdd,
  Ю: 0xde,
  Я: 0xdf,
  а: 0xe0,
  б: 0xe1,
  в: 0xe2,
  г: 0xe3,
  д: 0xe4,
  е: 0xe5,
  ж: 0xe6,
  з: 0xe7,
  и: 0xe8,
  й: 0xe9,
  к: 0xea,
  л: 0xeb,
  м: 0xec,
  н: 0xed,
  о: 0xee,
  п: 0xef,
  р: 0xf0,
  с: 0xf1,
  т: 0xf2,
  у: 0xf3,
  ф: 0xf4,
  х: 0xf5,
  ц: 0xf6,
  ч: 0xf7,
  ш: 0xf8,
  щ: 0xf9,
  ъ: 0xfa,
  ы: 0xfb,
  ь: 0xfc,
  э: 0xfd,
  ю: 0xfe,
  я: 0xff,
  Ё: 0xa8,
  ё: 0xb8,
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

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ── Types ──────────────────────────────────────────────────────────────

export interface ReceiptTemplate {
  /** Show table name/number (default: true) */
  showTable?: boolean;
  /** Show order short ID (default: true) */
  showOrderId?: boolean;
  /** Show staff/waiter name (default: true) */
  showStaff?: boolean;
  /** Show session opened time from TableSession (default: false) */
  showSessionOpened?: boolean;
  /** Show when the order was placed (default: false) */
  showOrderTime?: boolean;
  /** Show when the ticket was printed (default: true) */
  showPrintedAt?: boolean;
  /** Show item prices next to each line (default: false) */
  showPrices?: boolean;
  /** Show customer name (default: false) */
  showCustomerName?: boolean;
  /** Show source badge [POS] / [QR] (default: false) */
  showSource?: boolean;
  /** Custom header text — if empty, defaults to station name (default: '') */
  headerText?: string;
  /** Custom footer text appended before cut (default: '') */
  footerText?: string;
}

export interface PrintItem {
  quantity: number;
  name: string;
  price?: number;
  notes?: string | null;
  options?: string[];
}

export interface PrintTicket {
  stationName: string;
  orderShortId: string;
  tableName?: string | null;
  customerName: string;
  staffName?: string | null;
  sessionOpened?: Date | null;
  orderCreatedAt?: Date | null;
  source?: string | null;
  items: PrintItem[];
  timestamp: Date;
  specialRequests?: string | null;
  template?: ReceiptTemplate;
}

const DEFAULTS: ReceiptTemplate = {
  showTable: true,
  showOrderId: true,
  showStaff: true,
  showSessionOpened: false,
  showOrderTime: false,
  showPrintedAt: true,
  showPrices: false,
  showCustomerName: false,
  showSource: false,
  headerText: '',
  footerText: '',
};

// ── Builder ────────────────────────────────────────────────────────────

export function buildEscPosTicket(ticket: PrintTicket): Buffer {
  const tpl: ReceiptTemplate = { ...DEFAULTS, ...(ticket.template ?? {}) };
  const parts: Buffer[] = [CMD.INIT, CMD.CODEPAGE_CP866];

  // Header — center, double-height
  parts.push(CMD.ALIGN_CENTER);
  const header = tpl.headerText?.trim() || ticket.stationName;
  parts.push(
    CMD.DOUBLE_HEIGHT_ON,
    text(header.toUpperCase()),
    CMD.DOUBLE_HEIGHT_OFF,
  );

  // Source badge
  if (tpl.showSource && ticket.source) {
    const badge = ticket.source === 'POS' ? '[POS]' : '[QR]';
    parts.push(text(badge));
  }

  // Table number — prominent, center
  if (tpl.showTable && ticket.tableName) {
    parts.push(
      CMD.DOUBLE_HEIGHT_ON,
      CMD.BOLD_ON,
      text(ticket.tableName),
      CMD.BOLD_OFF,
      CMD.DOUBLE_HEIGHT_OFF,
    );
  }

  // Order ID
  if (tpl.showOrderId) {
    parts.push(text(`#${ticket.orderShortId}`));
  }

  parts.push(CMD.ALIGN_LEFT);

  // Server + Guest inline to save paper
  const metaLeft: string[] = [];
  const metaRight: string[] = [];
  if (tpl.showStaff && ticket.staffName)
    metaLeft.push(`Server: ${ticket.staffName}`);
  if (tpl.showCustomerName && ticket.customerName)
    metaRight.push(`Guest: ${ticket.customerName}`);

  if (metaLeft.length || metaRight.length) {
    const line =
      metaLeft.join('  ') +
      (metaLeft.length && metaRight.length ? '  ' : '') +
      metaRight.join('  ');
    parts.push(text(line));
  }

  // Opened + Order time inline
  const timeLeft: string[] = [];
  const timeRight: string[] = [];
  if (tpl.showSessionOpened && ticket.sessionOpened)
    timeLeft.push(`Opened: ${fmtTime(ticket.sessionOpened)}`);
  if (tpl.showOrderTime && ticket.orderCreatedAt)
    timeRight.push(`Order: ${fmtTime(ticket.orderCreatedAt)}`);

  if (timeLeft.length || timeRight.length) {
    const line =
      timeLeft.join('  ') +
      (timeLeft.length && timeRight.length ? '  ' : '') +
      timeRight.join('  ');
    parts.push(text(line));
  }

  parts.push(divider());

  // Special order-level requests
  if (ticket.specialRequests) {
    parts.push(
      CMD.BOLD_ON,
      text(`NOTE: ${ticket.specialRequests}`),
      CMD.BOLD_OFF,
      divider(),
    );
  }

  // Items
  for (const item of ticket.items) {
    const priceStr =
      tpl.showPrices && item.price
        ? `  ${(item.price * item.quantity).toFixed(2)}`
        : '';
    parts.push(
      CMD.BOLD_ON,
      text(`${item.quantity}x  ${item.name}${priceStr}`),
      CMD.BOLD_OFF,
    );

    if (item.options && item.options.length > 0) {
      for (const opt of item.options) {
        parts.push(text(`   + ${opt}`));
      }
    }
    if (item.notes) {
      parts.push(text(`   >> ${item.notes}`));
    }
  }

  // Footer
  parts.push(divider(), CMD.ALIGN_CENTER);

  // Printed-at timestamp
  if (tpl.showPrintedAt) {
    parts.push(text(fmtTime(ticket.timestamp)));
  }

  if (tpl.footerText?.trim()) {
    parts.push(text(tpl.footerText.trim()));
  }

  parts.push(CMD.FEED_4, CMD.CUT);
  return Buffer.concat(parts);
}
