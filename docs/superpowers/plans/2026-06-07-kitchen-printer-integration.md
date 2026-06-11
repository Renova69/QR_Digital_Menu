# Kitchen Printer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable restaurants to route orders to multiple ESC/POS printers (kitchen, bar, etc.) via a dedicated Android Expo print-agent app, with full reliability: every print job is persisted to DB and retried if the agent was offline.

**Architecture:**
- Backend adds `PrintStation`, `PrintAgentToken`, and `PrintJob` (PENDING→SENT→PRINTED/FAILED) Prisma models.
- On order create, `PrintStationService.routeOrderToPrinters()` groups items by `MenuCategory.printStationId`, creates one `PrintJob` per station (status=PENDING), then emits `print:job {jobId, ticket}` via Socket.io to the station room. If the room has no connected agent the job stays PENDING.
- On agent (re)connect, the gateway queries all PENDING + stale-SENT jobs for that station and re-emits them — no order ticket is ever lost.
- The Expo Android app authenticates via `agentToken`, runs as an Android Foreground Service, receives `print:job`, sends raw ESC/POS bytes to the local printer via TCP:9100, then emits `print:ack {jobId, success}` back.
- The gateway handles `print:ack` → updates `PrintJob` to PRINTED or FAILED (max 3 attempts then permanently FAILED).
- Dashboard shows a per-station health badge: green/amber/red based on pending/failed job counts.

**Tech Stack:** Prisma 6, NestJS 11, Socket.io, Expo bare workflow, `react-native-tcp-socket`, `@supersami/rn-foreground-service`, `socket.io-client`, `@react-native-async-storage/async-storage`, EAS Build (APK)

---

## File Map

### Backend — new files
- `apps/backend/src/print-station/print-station.module.ts`
- `apps/backend/src/print-station/print-station.service.ts`
- `apps/backend/src/print-station/print-station.controller.ts`
- `apps/backend/src/print-station/escpos.util.ts`
- `apps/backend/src/print-station/dto/create-print-station.dto.ts`
- `apps/backend/src/print-station/dto/update-print-station.dto.ts`
- `apps/backend/src/print-station/print-station.service.spec.ts`
- `apps/backend/src/print-station/escpos.util.spec.ts`

### Backend — modified files
- `apps/backend/prisma/schema.prisma` — add `PrintStation`, `PrintAgentToken`, `PrintJob`, `PrintJobStatus` enum; relations on `MenuCategory`, `Restaurant`, `Order`
- `apps/backend/src/app.module.ts` — register `PrintStationModule`
- `apps/backend/src/events/events.gateway.ts` — agent token auth, retry-on-reconnect, `emitPrintJob()`, handle `print:ack`
- `apps/backend/src/orders/orders.service.ts` — call routing after order create
- `apps/backend/src/orders/orders.module.ts` — import `PrintStationModule`

### Frontend dashboard — new/modified files
- `apps/frontend/src/pages/Dashboard/PrintStationsView.tsx` — station CRUD, token management, job health badges
- `apps/frontend/src/lib/api.ts` — print-station API calls
- `apps/frontend/src/i18n/en.json`, `bg.json`, `ro.json` — i18n keys

### Expo app — new project
- `apps/printer-agent/` — entire new Expo bare project

---

## Phase 1: Database Schema

### Task 1: Prisma Schema — PrintStation + PrintAgentToken + PrintJob

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Add PrintJobStatus enum**

Add before the `model PrintStation` block (anywhere enums are declared in the file):

```prisma
enum PrintJobStatus {
  PENDING
  SENT
  PRINTED
  FAILED
}
```

- [ ] **Step 2: Add PrintStation, PrintAgentToken, PrintJob models**

Add after the `TableZone` model block (around line 173):

```prisma
model PrintStation {
  id           String            @id @default(cuid())
  restaurantId String
  name         String
  printerIp    String
  printerPort  Int               @default(9100)
  isActive     Boolean           @default(true)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  restaurant   Restaurant        @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  categories   MenuCategory[]
  agentTokens  PrintAgentToken[]
  printJobs    PrintJob[]

  @@unique([restaurantId, name])
  @@index([restaurantId])
  @@map("print_station")
}

model PrintAgentToken {
  id             String       @id @default(cuid())
  token          String       @unique @default(cuid())
  printStationId String
  restaurantId   String
  label          String?
  lastSeenAt     DateTime?
  createdAt      DateTime     @default(now())
  printStation   PrintStation @relation(fields: [printStationId], references: [id], onDelete: Cascade)
  restaurant     Restaurant   @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([restaurantId])
  @@map("print_agent_token")
}

model PrintJob {
  id             String          @id @default(cuid())
  restaurantId   String
  printStationId String
  orderId        String
  ticketBase64   String
  status         PrintJobStatus  @default(PENDING)
  attempts       Int             @default(0)
  errorMessage   String?
  lastAttemptAt  DateTime?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  restaurant     Restaurant      @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  printStation   PrintStation    @relation(fields: [printStationId], references: [id], onDelete: Cascade)
  order          Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([printStationId, status])
  @@index([restaurantId, status])
  @@index([status, createdAt])
  @@map("print_job")
}
```

- [ ] **Step 3: Add printStationId FK to MenuCategory**

In the `MenuCategory` model, add after `isDrinkCategory`:

```prisma
  printStationId String?
  printStation   PrintStation? @relation(fields: [printStationId], references: [id], onDelete: SetNull)
```

- [ ] **Step 4: Add relations to Restaurant model**

In the `Restaurant` model, add after the `payments` relation line:

```prisma
  printStations    PrintStation[]
  printAgentTokens PrintAgentToken[]
  printJobs        PrintJob[]
```

- [ ] **Step 5: Add printJobs relation to Order model**

In the `Order` model, add after the `staff` relation:

```prisma
  printJobs PrintJob[]
```

- [ ] **Step 6: Run migration**

```bash
cd apps/backend
npx prisma migrate dev --name add_print_stations_and_jobs
```

Expected output: `✔  Your database is now in sync with your schema.`

- [ ] **Step 7: Verify Prisma client regenerated**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 8: Commit**

```bash
git add apps/backend/prisma/
git commit -m "feat(db): add PrintStation, PrintAgentToken, PrintJob models with reliability statuses"
```

---

## Phase 2: Backend — PrintStation Module

### Task 2: DTOs

**Files:**
- Create: `apps/backend/src/print-station/dto/create-print-station.dto.ts`
- Create: `apps/backend/src/print-station/dto/update-print-station.dto.ts`

- [ ] **Step 1: Create create DTO**

```typescript
// apps/backend/src/print-station/dto/create-print-station.dto.ts
import { IsString, IsInt, IsOptional, Min, Max } from 'class-validator';

export class CreatePrintStationDto {
  @IsString()
  name: string;

  @IsString()
  printerIp: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  printerPort?: number;
}
```

- [ ] **Step 2: Create update DTO**

```typescript
// apps/backend/src/print-station/dto/update-print-station.dto.ts
import { IsString, IsInt, IsOptional, Min, Max, IsBoolean } from 'class-validator';

export class UpdatePrintStationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  printerIp?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  printerPort?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/print-station/dto/
git commit -m "feat(print-station): add DTOs"
```

---

### Task 3: ESC/POS Ticket Builder Utility

**Files:**
- Create: `apps/backend/src/print-station/escpos.util.ts`
- Create: `apps/backend/src/print-station/escpos.util.spec.ts`

- [ ] **Step 1: Write the utility**

```typescript
// apps/backend/src/print-station/escpos.util.ts

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
```

- [ ] **Step 2: Write unit tests**

```typescript
// apps/backend/src/print-station/escpos.util.spec.ts
import { buildEscPosTicket } from './escpos.util';

describe('buildEscPosTicket', () => {
  it('returns a Buffer', () => {
    const result = buildEscPosTicket({
      stationName: 'Kitchen',
      orderShortId: 'ABC123',
      tableName: 'T1',
      customerName: 'John',
      items: [{ quantity: 2, name: 'Burger', notes: 'no onion' }],
      timestamp: new Date('2026-01-01T12:00:00Z'),
    });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes item name and quantity', () => {
    const result = buildEscPosTicket({
      stationName: 'Bar',
      orderShortId: 'XYZ',
      customerName: 'Alice',
      items: [{ quantity: 3, name: 'Beer' }],
      timestamp: new Date(),
    });
    expect(result.toString('utf8')).toContain('3x  Beer');
  });

  it('includes notes when present', () => {
    const result = buildEscPosTicket({
      stationName: 'Kitchen',
      orderShortId: '001',
      customerName: 'Bob',
      items: [{ quantity: 1, name: 'Steak', notes: 'rare' }],
      timestamp: new Date(),
    });
    expect(result.toString('utf8')).toContain('>> rare');
  });

  it('omits table line when tableName not provided', () => {
    const result = buildEscPosTicket({
      stationName: 'Kitchen',
      orderShortId: '002',
      customerName: 'Eve',
      items: [{ quantity: 1, name: 'Soup' }],
      timestamp: new Date(),
    });
    expect(result.toString('utf8')).not.toContain('Table:');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/backend
npx jest src/print-station/escpos.util.spec.ts --no-coverage
```

Expected: `Tests: 4 passed`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/print-station/escpos.util.ts apps/backend/src/print-station/escpos.util.spec.ts
git commit -m "feat(print-station): ESC/POS ticket builder with tests"
```

---

### Task 4: PrintStation Service (with PrintJob persistence + retry)

**Files:**
- Create: `apps/backend/src/print-station/print-station.service.ts`
- Create: `apps/backend/src/print-station/print-station.service.spec.ts`

- [ ] **Step 1: Write the service**

```typescript
// apps/backend/src/print-station/print-station.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrintStationDto } from './dto/create-print-station.dto';
import { UpdatePrintStationDto } from './dto/update-print-station.dto';
import { buildEscPosTicket, PrintItem } from './escpos.util';
import { EventsGateway } from '../events/events.gateway';

const MAX_PRINT_ATTEMPTS = 3;
/** A SENT job older than this is considered stale and will be retried on reconnect */
const STALE_SENT_MS = 30_000;

@Injectable()
export class PrintStationService {
  private readonly logger = new Logger(PrintStationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  // ─── Station CRUD ─────────────────────────────────────────────────────────

  async list(restaurantId: string) {
    return this.prisma.printStation.findMany({
      where: { restaurantId },
      include: {
        agentTokens: {
          select: { id: true, label: true, lastSeenAt: true, createdAt: true },
        },
        _count: {
          select: {
            printJobs: { where: { status: { in: ['PENDING', 'FAILED'] } } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(restaurantId: string, dto: CreatePrintStationDto) {
    const existing = await this.prisma.printStation.findUnique({
      where: { restaurantId_name: { restaurantId, name: dto.name } },
    });
    if (existing) throw new ConflictException(`Station "${dto.name}" already exists`);

    return this.prisma.printStation.create({
      data: {
        restaurantId,
        name: dto.name,
        printerIp: dto.printerIp,
        printerPort: dto.printerPort ?? 9100,
      },
    });
  }

  async update(restaurantId: string, stationId: string, dto: UpdatePrintStationDto) {
    await this.assertOwnership(restaurantId, stationId);
    return this.prisma.printStation.update({ where: { id: stationId }, data: dto });
  }

  async remove(restaurantId: string, stationId: string) {
    await this.assertOwnership(restaurantId, stationId);
    await this.prisma.printStation.delete({ where: { id: stationId } });
  }

  // ─── Agent Tokens ─────────────────────────────────────────────────────────

  async generateToken(restaurantId: string, stationId: string, label?: string) {
    await this.assertOwnership(restaurantId, stationId);
    return this.prisma.printAgentToken.create({
      data: { restaurantId, printStationId: stationId, label },
    });
  }

  async revokeToken(restaurantId: string, tokenId: string) {
    const record = await this.prisma.printAgentToken.findFirst({
      where: { id: tokenId, restaurantId },
    });
    if (!record) throw new NotFoundException('Token not found');
    await this.prisma.printAgentToken.delete({ where: { id: tokenId } });
  }

  async validateAgentToken(token: string) {
    return this.prisma.printAgentToken.findUnique({
      where: { token },
      include: { printStation: true },
    });
  }

  async touchLastSeen(token: string) {
    await this.prisma.printAgentToken.update({
      where: { token },
      data: { lastSeenAt: new Date() },
    }).catch(() => { /* token may have been revoked — swallow */ });
  }

  // ─── Order Routing ────────────────────────────────────────────────────────

  /**
   * Called after every order is saved. Groups items by print station,
   * creates one PrintJob per station (PENDING), then tries to emit
   * immediately. If the agent is offline the job stays PENDING and will
   * be retried when the agent reconnects (see retryPendingJobs).
   */
  async routeOrderToPrinters(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            menuItem: {
              include: { category: { include: { printStation: true } } },
            },
          },
        },
      },
    });
    if (!order) return;

    const stationMap = new Map<string, { station: any; items: PrintItem[] }>();

    for (const item of order.items) {
      const station = item.menuItem?.category?.printStation;
      if (!station || !station.isActive) continue;

      if (!stationMap.has(station.id)) {
        stationMap.set(station.id, { station, items: [] });
      }

      const options: string[] = [];
      const selectedOptions = item.selectedOptions as any[];
      if (Array.isArray(selectedOptions)) {
        for (const opt of selectedOptions) {
          options.push(`${opt.optionName}: ${opt.choiceName}`);
        }
      }

      stationMap.get(station.id)!.items.push({
        quantity: item.quantity,
        name: item.menuItem?.name ?? 'Unknown item',
        options,
        notes: null,
      });
    }

    for (const [stationId, { station, items }] of stationMap) {
      const ticket = buildEscPosTicket({
        stationName: station.name,
        orderShortId: order.id.slice(-6).toUpperCase(),
        tableName: order.tableName,
        customerName: order.customerName,
        items,
        timestamp: new Date(),
      });

      const ticketBase64 = ticket.toString('base64');

      // Always persist the job first — if emit fails, job stays PENDING
      const job = await this.prisma.printJob.create({
        data: {
          restaurantId: order.restaurantId,
          printStationId: stationId,
          orderId,
          ticketBase64,
          status: 'PENDING',
        },
      });

      const emitted = this.events.emitPrintJob(order.restaurantId, stationId, job.id, ticketBase64);

      if (emitted) {
        await this.prisma.printJob.update({
          where: { id: job.id },
          data: { status: 'SENT', attempts: 1, lastAttemptAt: new Date() },
        });
        this.logger.log(`Print job ${job.id} sent to station ${station.name}`);
      } else {
        this.logger.warn(
          `No agent connected for station ${station.name} — job ${job.id} queued as PENDING`,
        );
      }
    }
  }

  // ─── Retry on Agent Reconnect ─────────────────────────────────────────────

  /**
   * Called by EventsGateway when a print agent connects (or reconnects).
   * Re-emits any PENDING jobs and SENT jobs that are stale (> 30s without ack).
   */
  async retryPendingJobs(restaurantId: string, stationId: string): Promise<void> {
    const staleThreshold = new Date(Date.now() - STALE_SENT_MS);

    const jobs = await this.prisma.printJob.findMany({
      where: {
        restaurantId,
        printStationId: stationId,
        status: {
          in: ['PENDING', 'SENT'],
        },
        attempts: { lt: MAX_PRINT_ATTEMPTS },
        OR: [
          { status: 'PENDING' },
          { status: 'SENT', lastAttemptAt: { lt: staleThreshold } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    if (jobs.length === 0) return;

    this.logger.log(
      `Retrying ${jobs.length} pending job(s) for station ${stationId}`,
    );

    for (const job of jobs) {
      this.events.emitPrintJob(restaurantId, stationId, job.id, job.ticketBase64);

      await this.prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: 'SENT',
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });
    }
  }

  // ─── Acknowledgement ─────────────────────────────────────────────────────

  /**
   * Called by EventsGateway when agent emits print:ack.
   */
  async handlePrintAck(
    jobId: string,
    success: boolean,
    error?: string,
  ): Promise<void> {
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    if (success) {
      await this.prisma.printJob.update({
        where: { id: jobId },
        data: { status: 'PRINTED', errorMessage: null },
      });
    } else {
      const newAttempts = job.attempts; // already incremented on emit
      const permanentlyFailed = newAttempts >= MAX_PRINT_ATTEMPTS;

      await this.prisma.printJob.update({
        where: { id: jobId },
        data: {
          status: permanentlyFailed ? 'FAILED' : 'PENDING',
          errorMessage: error ?? 'Unknown printer error',
        },
      });

      if (permanentlyFailed) {
        this.logger.error(
          `Print job ${jobId} permanently FAILED after ${newAttempts} attempts: ${error}`,
        );
      }
    }
  }

  // ─── Dashboard Health ─────────────────────────────────────────────────────

  async getStationHealth(restaurantId: string) {
    const stations = await this.prisma.printStation.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        isActive: true,
        agentTokens: { select: { lastSeenAt: true } },
        printJobs: {
          where: { status: { in: ['PENDING', 'FAILED', 'PRINTED'] } },
          select: { status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    return stations.map((s) => {
      const pending = s.printJobs.filter((j) => j.status === 'PENDING').length;
      const failed = s.printJobs.filter((j) => j.status === 'FAILED').length;
      const lastPrinted = s.printJobs.find((j) => j.status === 'PRINTED')?.createdAt ?? null;
      const lastSeen = s.agentTokens
        .map((t) => t.lastSeenAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;

      return { id: s.id, name: s.name, isActive: s.isActive, pending, failed, lastPrinted, lastSeen };
    });
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async assertOwnership(restaurantId: string, stationId: string) {
    const station = await this.prisma.printStation.findUnique({ where: { id: stationId } });
    if (!station) throw new NotFoundException('Print station not found');
    if (station.restaurantId !== restaurantId) throw new ForbiddenException();
    return station;
  }
}
```

- [ ] **Step 2: Write service tests**

```typescript
// apps/backend/src/print-station/print-station.service.spec.ts
import { Test } from '@nestjs/testing';
import { PrintStationService } from './print-station.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { ConflictException, NotFoundException } from '@nestjs/common';

const mockPrisma = {
  printStation: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  printAgentToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  printJob: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  order: { findUnique: jest.fn() },
};

const mockEvents = { emitPrintJob: jest.fn().mockReturnValue(true) };

describe('PrintStationService', () => {
  let service: PrintStationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PrintStationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsGateway, useValue: mockEvents },
      ],
    }).compile();
    service = module.get(PrintStationService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('throws ConflictException when name already exists', async () => {
      mockPrisma.printStation.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create('r1', { name: 'Kitchen', printerIp: '192.168.1.1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates station with default port 9100', async () => {
      mockPrisma.printStation.findUnique.mockResolvedValue(null);
      mockPrisma.printStation.create.mockResolvedValue({ id: 'new', name: 'Kitchen', printerPort: 9100 });
      const result = await service.create('r1', { name: 'Kitchen', printerIp: '192.168.1.1' });
      expect(result.printerPort).toBe(9100);
    });
  });

  describe('routeOrderToPrinters', () => {
    it('creates PrintJob and emits when agent connected', async () => {
      mockEvents.emitPrintJob.mockReturnValue(true);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order123',
        restaurantId: 'r1',
        tableName: 'T5',
        customerName: 'Alice',
        items: [{
          quantity: 2,
          menuItem: {
            name: 'Burger',
            category: { printStation: { id: 'station1', name: 'Kitchen', isActive: true } },
          },
          selectedOptions: [],
        }],
      });
      mockPrisma.printJob.create.mockResolvedValue({ id: 'job1', ticketBase64: 'abc' });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.routeOrderToPrinters('order123');

      expect(mockPrisma.printJob.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
      );
      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
      );
    });

    it('leaves job as PENDING when no agent connected', async () => {
      mockEvents.emitPrintJob.mockReturnValue(false);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order456',
        restaurantId: 'r1',
        tableName: null,
        customerName: 'Bob',
        items: [{
          quantity: 1,
          menuItem: {
            name: 'Salad',
            category: { printStation: { id: 'station1', name: 'Kitchen', isActive: true } },
          },
          selectedOptions: [],
        }],
      });
      mockPrisma.printJob.create.mockResolvedValue({ id: 'job2', ticketBase64: 'xyz' });

      await service.routeOrderToPrinters('order456');

      expect(mockPrisma.printJob.update).not.toHaveBeenCalled();
    });

    it('skips items with no station assigned', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order789',
        restaurantId: 'r1',
        tableName: null,
        customerName: 'Eve',
        items: [{
          quantity: 1,
          menuItem: { name: 'Water', category: { printStation: null } },
          selectedOptions: [],
        }],
      });

      await service.routeOrderToPrinters('order789');
      expect(mockPrisma.printJob.create).not.toHaveBeenCalled();
    });
  });

  describe('handlePrintAck', () => {
    it('sets status to PRINTED on success', async () => {
      mockPrisma.printJob.findUnique.mockResolvedValue({ id: 'j1', attempts: 1 });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck('j1', true);

      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PRINTED' }) }),
      );
    });

    it('sets status to FAILED when max attempts reached', async () => {
      mockPrisma.printJob.findUnique.mockResolvedValue({ id: 'j2', attempts: 3 });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck('j2', false, 'connection refused');

      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('sets status back to PENDING for retry when under max attempts', async () => {
      mockPrisma.printJob.findUnique.mockResolvedValue({ id: 'j3', attempts: 1 });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck('j3', false, 'timeout');

      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
      );
    });
  });

  describe('revokeToken', () => {
    it('throws NotFoundException when token not in restaurant', async () => {
      mockPrisma.printAgentToken.findFirst.mockResolvedValue(null);
      await expect(service.revokeToken('r1', 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/backend
npx jest src/print-station/print-station.service.spec.ts --no-coverage
```

Expected: `Tests: 7 passed`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/print-station/
git commit -m "feat(print-station): service with PrintJob persistence, retry logic, ack handling"
```

---

### Task 5: PrintStation Controller

**Files:**
- Create: `apps/backend/src/print-station/print-station.controller.ts`

- [ ] **Step 1: Write the controller**

```typescript
// apps/backend/src/print-station/print-station.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, Request,
} from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrintStationService } from './print-station.service';
import { CreatePrintStationDto } from './dto/create-print-station.dto';
import { UpdatePrintStationDto } from './dto/update-print-station.dto';
import { RestaurantsService } from '../restaurants/restaurants.service';

class GenerateTokenDto {
  @IsOptional()
  @IsString()
  label?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('print-stations')
export class PrintStationController {
  constructor(
    private readonly service: PrintStationService,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  private async getRestaurantId(userId: string): Promise<string> {
    const restaurant = await this.restaurantsService.findByOwner(userId);
    if (!restaurant) throw new Error('Restaurant not found');
    return restaurant.id;
  }

  @Get()
  async list(@Request() req: any) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    return this.service.list(restaurantId);
  }

  @Get('health')
  async health(@Request() req: any) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    return this.service.getStationHealth(restaurantId);
  }

  @Post()
  async create(@Request() req: any, @Body() dto: CreatePrintStationDto) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    return this.service.create(restaurantId, dto);
  }

  @Patch(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePrintStationDto,
  ) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    return this.service.update(restaurantId, id, dto);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    await this.service.remove(restaurantId, id);
    return { success: true };
  }

  @Post(':id/tokens')
  async generateToken(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: GenerateTokenDto,
  ) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    return this.service.generateToken(restaurantId, id, dto.label);
  }

  @Delete('tokens/:tokenId')
  async revokeToken(@Request() req: any, @Param('tokenId') tokenId: string) {
    const restaurantId = await this.getRestaurantId(req.user.id);
    await this.service.revokeToken(restaurantId, tokenId);
    return { success: true };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/print-station/print-station.controller.ts
git commit -m "feat(print-station): REST controller with health endpoint"
```

---

### Task 6: PrintStation Module + App Registration

**Files:**
- Create: `apps/backend/src/print-station/print-station.module.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Create module**

```typescript
// apps/backend/src/print-station/print-station.module.ts
import { Module } from '@nestjs/common';
import { PrintStationService } from './print-station.service';
import { PrintStationController } from './print-station.controller';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [RestaurantsModule, EventsModule],
  controllers: [PrintStationController],
  providers: [PrintStationService],
  exports: [PrintStationService],
})
export class PrintStationModule {}
```

- [ ] **Step 2: Register in app.module.ts**

Open `apps/backend/src/app.module.ts`. Add import:

```typescript
import { PrintStationModule } from './print-station/print-station.module';
```

Add `PrintStationModule` to the `imports` array after `PaymentModule`.

- [ ] **Step 3: Build to verify no errors**

```bash
cd apps/backend
npm run build
```

Expected: `Successfully compiled`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/print-station/print-station.module.ts apps/backend/src/app.module.ts
git commit -m "feat(print-station): register module"
```

---

### Task 7: Extend EventsGateway — Agent Auth + Retry on Reconnect + Ack Handler

**Files:**
- Modify: `apps/backend/src/events/events.gateway.ts`

- [ ] **Step 1: Inject PrintStationService**

At the top of `events.gateway.ts`, add import:

```typescript
import { PrintStationService } from '../print-station/print-station.service';
```

Update the constructor to inject it:

```typescript
constructor(
  private readonly jwt: JwtService,
  private readonly prisma: PrismaService,
  private readonly printStationService: PrintStationService,
) {}
```

- [ ] **Step 2: Add agent token handling in handleConnection**

In `handleConnection`, after the existing cookie/JWT block, add:

```typescript
// Print agent auth — agents send agentToken in socket.auth, no cookie
const agentToken = client.handshake.auth?.agentToken as string | undefined;
if (agentToken && !client.data.userId) {
  const record = await this.prisma.printAgentToken.findUnique({
    where: { token: agentToken },
    include: { printStation: true },
  });

  if (!record) {
    this.logger.warn(`Invalid agent token from ${client.id} — disconnecting`);
    client.disconnect();
    return;
  }

  client.data.agentRestaurantId = record.restaurantId;
  client.data.agentStationId = record.printStationId;
  client.join(`print:${record.restaurantId}:${record.printStationId}`);

  // Fire-and-forget: touch lastSeenAt + retry any pending jobs
  void this.printStationService.touchLastSeen(agentToken);
  void this.printStationService
    .retryPendingJobs(record.restaurantId, record.printStationId)
    .catch((err) =>
      this.logger.error(`Retry failed for station ${record.printStationId}: ${err.message}`),
    );

  this.logger.log(
    `Print agent connected: ${record.printStation.name} socket=${client.id}`,
  );
}
```

- [ ] **Step 3: Add emitPrintJob method (returns boolean — true if room has sockets)**

Add after `emitZoneChanged`:

```typescript
/**
 * Emit a print job to the station room.
 * Returns true if at least one agent socket is in the room (job delivered),
 * false if the room is empty (job stays PENDING for retry on reconnect).
 */
emitPrintJob(
  restaurantId: string,
  stationId: string,
  jobId: string,
  ticketBase64: string,
): boolean {
  const room = `print:${restaurantId}:${stationId}`;
  const sockets = this.server.sockets.adapter.rooms.get(room);
  const hasAgents = sockets !== undefined && sockets.size > 0;

  if (hasAgents) {
    this.server.to(room).emit('print:job', { jobId, ticket: ticketBase64 });
  }

  return hasAgents;
}
```

- [ ] **Step 4: Add print:ack message handler**

Add after the `leaveRestaurantRoom` handler:

```typescript
@SubscribeMessage('print:ack')
async handlePrintAck(
  @MessageBody() body: { jobId: string; success: boolean; error?: string },
  @ConnectedSocket() client: Socket,
) {
  // Only allow agents to ack (they have agentStationId set on connect)
  if (!client.data.agentStationId) return;

  await this.printStationService
    .handlePrintAck(body.jobId, body.success, body.error)
    .catch((err) =>
      this.logger.error(`handlePrintAck failed for job ${body.jobId}: ${err.message}`),
    );
}
```

- [ ] **Step 5: Add PrintStationModule to EventsModule imports**

Open `apps/backend/src/events/events.module.ts`. Add:

```typescript
import { PrintStationModule } from '../print-station/print-station.module';
// Add PrintStationModule to imports array
```

**Note:** This creates a potential circular dependency (`PrintStationModule` imports `EventsModule`, `EventsModule` imports `PrintStationModule`). Resolve with `forwardRef`:

In `events.module.ts`:
```typescript
imports: [JwtModule, forwardRef(() => PrintStationModule)],
```

In `print-station.module.ts`:
```typescript
imports: [RestaurantsModule, forwardRef(() => EventsModule)],
```

- [ ] **Step 6: Build**

```bash
cd apps/backend
npm run build
```

Expected: `Successfully compiled`

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/events/
git commit -m "feat(events): agent auth, retry-on-reconnect, print:ack handler, emitPrintJob returns boolean"
```

---

### Task 8: Hook OrdersService to Route Print Jobs

**Files:**
- Modify: `apps/backend/src/orders/orders.service.ts`
- Modify: `apps/backend/src/orders/orders.module.ts`

- [ ] **Step 1: Inject PrintStationService into OrdersService**

Add import at top of `orders.service.ts`:

```typescript
import { PrintStationService } from '../print-station/print-station.service';
```

Update the constructor:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly eventsGateway: EventsGateway,
  private readonly featureService: FeatureService,
  private readonly printStationService: PrintStationService,
) {}
```

- [ ] **Step 2: Call routeOrderToPrinters after order is saved**

In `OrdersService.create()`, find the point where the order has been successfully saved and the method is about to return or emit socket events. After that point, add:

```typescript
// Fire-and-forget print routing — must not fail or delay the order response
void this.printStationService
  .routeOrderToPrinters(order.id)
  .catch((err) =>
    this.logger.error(`Print routing failed for order ${order.id}: ${err.message}`),
  );
```

- [ ] **Step 3: Add PrintStationModule to OrdersModule**

In `apps/backend/src/orders/orders.module.ts`, add:

```typescript
import { PrintStationModule } from '../print-station/print-station.module';
// Add PrintStationModule to imports array (use forwardRef if needed)
```

- [ ] **Step 4: Build**

```bash
cd apps/backend
npm run build
```

Expected: `Successfully compiled`

- [ ] **Step 5: Run existing order tests**

```bash
cd apps/backend
npx jest src/orders/ --no-coverage
```

Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/orders/
git commit -m "feat(orders): trigger print routing after order create"
```

---

## Phase 3: Dashboard UI

### Task 9: Print Stations Settings Tab with Health Badges

**Files:**
- Create: `apps/frontend/src/pages/Dashboard/PrintStationsView.tsx`
- Modify: `apps/frontend/src/lib/api.ts`
- Modify: `apps/frontend/src/i18n/en.json`, `bg.json`, `ro.json`

- [ ] **Step 1: Add API calls to api.ts**

```typescript
// Append to apps/frontend/src/lib/api.ts

export const getPrintStations = () =>
  api.get('/print-stations').then((r) => r.data);

export const getPrintStationHealth = () =>
  api.get('/print-stations/health').then((r) => r.data);

export const createPrintStation = (data: {
  name: string; printerIp: string; printerPort?: number;
}) => api.post('/print-stations', data).then((r) => r.data);

export const updatePrintStation = (
  id: string,
  data: Partial<{ name: string; printerIp: string; printerPort: number; isActive: boolean }>,
) => api.patch(`/print-stations/${id}`, data).then((r) => r.data);

export const deletePrintStation = (id: string) =>
  api.delete(`/print-stations/${id}`).then((r) => r.data);

export const generateAgentToken = (stationId: string, label?: string) =>
  api.post(`/print-stations/${stationId}/tokens`, { label }).then((r) => r.data);

export const revokeAgentToken = (tokenId: string) =>
  api.delete(`/print-stations/tokens/${tokenId}`).then((r) => r.data);
```

- [ ] **Step 2: Add i18n keys to en.json**

Find the nearest appropriate section in `apps/frontend/src/i18n/en.json` and add:

```json
"printStations": {
  "title": "Print Stations",
  "description": "Configure kitchen and bar printers. Items route to stations by menu category.",
  "addStation": "Add Station",
  "stationName": "Station Name",
  "printerIp": "Printer IP",
  "printerPort": "Port",
  "namePlaceholder": "Kitchen / Bar / Expo",
  "ipPlaceholder": "192.168.1.50",
  "generateToken": "Generate Agent Token",
  "tokenLabel": "Device Label",
  "tokenLabelPlaceholder": "Kitchen Tablet",
  "tokenCopied": "Token copied!",
  "revokeToken": "Revoke",
  "noStations": "No print stations configured.",
  "agentTokens": "Agent Tokens",
  "lastSeen": "Last seen",
  "neverConnected": "Never connected",
  "pendingJobs": "{{count}} pending",
  "failedJobs": "{{count}} failed",
  "healthy": "Healthy"
}
```

Add equivalent keys (translated) to `bg.json` and `ro.json`.

- [ ] **Step 3: Create PrintStationsView.tsx**

```tsx
// apps/frontend/src/pages/Dashboard/PrintStationsView.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Trash2, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  getPrintStations, getPrintStationHealth,
  createPrintStation, deletePrintStation,
  generateAgentToken, revokeAgentToken,
} from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

interface StationHealth {
  id: string; name: string; isActive: boolean;
  pending: number; failed: number;
  lastPrinted: string | null; lastSeen: string | null;
}

interface AgentToken {
  id: string; label: string | null; lastSeenAt: string | null; createdAt: string;
}

interface PrintStation {
  id: string; name: string; printerIp: string; printerPort: number;
  isActive: boolean; agentTokens: AgentToken[];
}

function HealthBadge({ health }: { health: StationHealth | undefined }) {
  if (!health) return null;

  const agentOnline = health.lastSeen
    ? Date.now() - new Date(health.lastSeen).getTime() < 60_000
    : false;

  if (!agentOnline) {
    return (
      <Badge variant="outline" className="text-amber-500 border-amber-500 gap-1">
        <WifiOff className="w-3 h-3" /> Offline
        {health.pending > 0 && ` · ${health.pending} pending`}
      </Badge>
    );
  }
  if (health.failed > 0) {
    return (
      <Badge variant="outline" className="text-red-500 border-red-500 gap-1">
        <AlertTriangle className="w-3 h-3" /> {health.failed} failed
      </Badge>
    );
  }
  if (health.pending > 0) {
    return (
      <Badge variant="outline" className="text-amber-500 border-amber-500 gap-1">
        <Wifi className="w-3 h-3" /> {health.pending} pending
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-green-500 border-green-500 gap-1">
      <Wifi className="w-3 h-3" /> Online
    </Badge>
  );
}

export default function PrintStationsView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newPort, setNewPort] = useState('9100');

  const { data: stations = [], isLoading } = useQuery<PrintStation[]>({
    queryKey: ['print-stations'],
    queryFn: getPrintStations,
  });

  const { data: health = [] } = useQuery<StationHealth[]>({
    queryKey: ['print-stations-health'],
    queryFn: getPrintStationHealth,
    refetchInterval: 15_000,
  });

  const healthMap = Object.fromEntries(health.map((h) => [h.id, h]));

  const createMutation = useMutation({
    mutationFn: () =>
      createPrintStation({ name: newName, printerIp: newIp, printerPort: parseInt(newPort) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-stations'] });
      setNewName(''); setNewIp(''); setNewPort('9100');
    },
    onError: () => toast.error('Failed to create station'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePrintStation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-stations'] }),
    onError: () => toast.error('Failed to delete station'),
  });

  const generateTokenMutation = useMutation({
    mutationFn: (stationId: string) => generateAgentToken(stationId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['print-stations'] });
      navigator.clipboard.writeText(data.token);
      toast.success(t('printStations.tokenCopied'));
    },
    onError: () => toast.error('Failed to generate token'),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => revokeAgentToken(tokenId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-stations'] }),
    onError: () => toast.error('Failed to revoke token'),
  });

  if (isLoading) return <div className="p-6 text-sm">Loading...</div>;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t('printStations.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('printStations.description')}</p>
      </div>

      {/* Add station */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('printStations.addStation')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input placeholder={t('printStations.namePlaceholder')} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder={t('printStations.ipPlaceholder')} value={newIp} onChange={(e) => setNewIp(e.target.value)} />
            <Input placeholder="9100" value={newPort} onChange={(e) => setNewPort(e.target.value)} type="number" />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!newName || !newIp || createMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('printStations.addStation')}
          </Button>
        </CardContent>
      </Card>

      {stations.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('printStations.noStations')}</p>
      )}

      {stations.map((station) => (
        <Card key={station.id}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">{station.name}</CardTitle>
              <HealthBadge health={healthMap[station.id]} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{station.printerIp}:{station.printerPort}</span>
              <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(station.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              size="sm" variant="outline"
              onClick={() => generateTokenMutation.mutate(station.id)}
              disabled={generateTokenMutation.isPending}
            >
              <Plus className="w-3 h-3 mr-1" />
              {t('printStations.generateToken')} (copies to clipboard)
            </Button>

            {station.agentTokens.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('printStations.agentTokens')}
                </p>
                {station.agentTokens.map((tok) => (
                  <div key={tok.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{tok.label ?? 'Agent'}</span>
                      <span className="ml-3 text-muted-foreground text-xs">
                        {tok.lastSeenAt
                          ? formatDistanceToNow(new Date(tok.lastSeenAt), { addSuffix: true })
                          : t('printStations.neverConnected')}
                      </span>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => revokeTokenMutation.mutate(tok.id)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire PrintStationsView into SettingsView tab list**

In `apps/frontend/src/pages/Dashboard/SettingsView.tsx` (or whichever file manages settings tabs), add a "Printers" tab that renders `<PrintStationsView />`.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/PrintStationsView.tsx apps/frontend/src/lib/api.ts apps/frontend/src/i18n/
git commit -m "feat(dashboard): print stations tab with health badges and job status"
```

---

### Task 10: Category → Station Assignment

**Files:**
- Modify: `apps/backend/src/menu/dto/update-category.dto.ts` (or equivalent)
- Modify: Category management modal in `apps/frontend/src/`

- [ ] **Step 1: Add printStationId to backend category update DTO**

In `apps/backend/src/menu/dto/update-category.dto.ts`:

```typescript
@IsOptional()
@IsString()
printStationId?: string | null;
```

- [ ] **Step 2: Include printStationId in menu service updateCategory**

In `apps/backend/src/menu/menu.service.ts`, find the `updateCategory` method and ensure `printStationId` is passed through in the Prisma update data object.

- [ ] **Step 3: Add station selector to category edit form on frontend**

In the category management modal component, add:

```tsx
const { data: stations = [] } = useQuery({
  queryKey: ['print-stations'],
  queryFn: getPrintStations,
});

// In the form JSX, add after existing fields:
<div>
  <label className="text-sm font-medium">Print Station</label>
  <select
    value={form.printStationId ?? ''}
    onChange={(e) => setForm({ ...form, printStationId: e.target.value || null })}
    className="mt-1 w-full rounded border px-3 py-2 text-sm bg-background"
  >
    <option value="">None (no printing)</option>
    {(stations as any[]).map((s) => (
      <option key={s.id} value={s.id}>{s.name} — {s.printerIp}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/menu/ apps/frontend/src/
git commit -m "feat(menu): category → print station assignment"
```

---

## Phase 4: Expo Print Agent App

### Task 11: Bootstrap Expo Bare Project

**Files:**
- Create: `apps/printer-agent/` (entire new project)

- [ ] **Step 1: Scaffold the project**

```bash
cd apps
npx create-expo-app@latest printer-agent --template bare-minimum
cd printer-agent
```

- [ ] **Step 2: Install dependencies**

```bash
npm install socket.io-client
npm install @react-native-async-storage/async-storage
npm install react-native-tcp-socket
npm install @supersami/rn-foreground-service
npm install expo-clipboard
```

- [ ] **Step 3: Configure app.json**

Replace the contents of `apps/printer-agent/app.json`:

```json
{
  "expo": {
    "name": "QR Menu Print Agent",
    "slug": "qr-menu-print-agent",
    "version": "1.0.0",
    "platforms": ["android"],
    "android": {
      "package": "com.qrmenu.printagent",
      "permissions": [
        "INTERNET",
        "FOREGROUND_SERVICE",
        "RECEIVE_BOOT_COMPLETED",
        "WAKE_LOCK"
      ]
    },
    "plugins": [
      "@supersami/rn-foreground-service"
    ]
  }
}
```

- [ ] **Step 4: Create eas.json**

Create `apps/printer-agent/eas.json`:

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "preview": {
      "android": { "buildType": "apk", "gradleCommand": ":app:assembleDebug" }
    },
    "production": {
      "android": { "buildType": "apk", "gradleCommand": ":app:assembleRelease" }
    }
  }
}
```

- [ ] **Step 5: Prebuild native Android**

```bash
npx expo prebuild --platform android
```

Expected: `apps/printer-agent/android/` directory created.

- [ ] **Step 6: Commit**

```bash
git add apps/printer-agent/
git commit -m "feat(printer-agent): bootstrap Expo bare project"
```

---

### Task 12: Config Storage + Setup Screen

**Files:**
- Create: `apps/printer-agent/src/store/config.ts`
- Create: `apps/printer-agent/src/screens/SetupScreen.tsx`

- [ ] **Step 1: Create config store**

```typescript
// apps/printer-agent/src/store/config.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AgentConfig {
  serverUrl: string;
  agentToken: string;
  printerIp: string;
  printerPort: number;
  stationName: string;
}

const KEY = 'agent_config_v1';

export async function loadConfig(): Promise<AgentConfig | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AgentConfig; }
  catch { return null; }
}

export async function saveConfig(config: AgentConfig): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(config));
}

export async function clearConfig(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
```

- [ ] **Step 2: Create SetupScreen**

```tsx
// apps/printer-agent/src/screens/SetupScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert,
} from 'react-native';
import { saveConfig, AgentConfig } from '../store/config';

interface Props { onComplete: (config: AgentConfig) => void; }

export default function SetupScreen({ onComplete }: Props) {
  const [serverUrl, setServerUrl] = useState('https://');
  const [agentToken, setAgentToken] = useState('');
  const [printerIp, setPrinterIp] = useState('');
  const [printerPort, setPrinterPort] = useState('9100');
  const [stationName, setStationName] = useState('Kitchen');

  const handleSave = async () => {
    if (!agentToken.trim() || !printerIp.trim()) {
      Alert.alert('Missing fields', 'Agent token and printer IP are required.');
      return;
    }
    const config: AgentConfig = {
      serverUrl: serverUrl.replace(/\/$/, ''),
      agentToken: agentToken.trim(),
      printerIp: printerIp.trim(),
      printerPort: parseInt(printerPort, 10) || 9100,
      stationName: stationName.trim() || 'Kitchen',
    };
    await saveConfig(config);
    onComplete(config);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Print Agent Setup</Text>
      <Text style={styles.subtitle}>Configure once — runs silently in background 24/7</Text>

      {[
        { label: 'Server URL', value: serverUrl, onChange: setServerUrl, placeholder: 'https://your-app.run.app', keyboard: 'url' as const },
        { label: 'Agent Token (paste from dashboard)', value: agentToken, onChange: setAgentToken, placeholder: 'cuid...', keyboard: 'default' as const },
        { label: 'Printer IP', value: printerIp, onChange: setPrinterIp, placeholder: '192.168.1.50', keyboard: 'numeric' as const },
        { label: 'Printer Port', value: printerPort, onChange: setPrinterPort, placeholder: '9100', keyboard: 'numeric' as const },
        { label: 'Station Name', value: stationName, onChange: setStationName, placeholder: 'Kitchen / Bar', keyboard: 'default' as const },
      ].map(({ label, value, onChange, placeholder, keyboard }) => (
        <View key={label}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor="#555"
            autoCapitalize="none"
            keyboardType={keyboard}
          />
        </View>
      ))}

      <TouchableOpacity style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Save & Start Agent</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#0f0f23', minHeight: '100%' },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 32 },
  label: { fontSize: 13, color: '#aaa', marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#1e1e3a', color: '#fff', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    borderWidth: 1, borderColor: '#333',
  },
  button: {
    backgroundColor: '#6366f1', borderRadius: 8, paddingVertical: 14,
    alignItems: 'center', marginTop: 32,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/printer-agent/src/
git commit -m "feat(printer-agent): config store + setup screen"
```

---

### Task 13: TCP Printer Service

**Files:**
- Create: `apps/printer-agent/src/services/printer.service.ts`

- [ ] **Step 1: Write TCP printer service**

```typescript
// apps/printer-agent/src/services/printer.service.ts
import TcpSocket from 'react-native-tcp-socket';

export async function printTicket(
  ip: string,
  port: number,
  base64Ticket: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bytes = Buffer.from(base64Ticket, 'base64');

    const client = TcpSocket.createConnection({ host: ip, port }, () => {
      client.write(bytes);
      setTimeout(() => {
        client.destroy();
        resolve();
      }, 500);
    });

    client.on('error', (err) => {
      client.destroy();
      reject(new Error(`Printer TCP error: ${err.message}`));
    });

    client.setTimeout(5000);
    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Printer connection timeout'));
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/printer-agent/src/services/printer.service.ts
git commit -m "feat(printer-agent): TCP printer service"
```

---

### Task 14: Socket Service with print:ack

**Files:**
- Create: `apps/printer-agent/src/services/socket.service.ts`

- [ ] **Step 1: Write socket service**

```typescript
// apps/printer-agent/src/services/socket.service.ts
import { io, Socket } from 'socket.io-client';
import { AgentConfig } from '../store/config';
import { printTicket } from './printer.service';

export type AgentStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

type StatusCallback = (status: AgentStatus, detail?: string) => void;
type PrintCallback = (jobId: string, success: boolean, error?: string) => void;

let socket: Socket | null = null;

export function startSocketAgent(
  config: AgentConfig,
  onStatus: StatusCallback,
  onPrint: PrintCallback,
): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(config.serverUrl, {
    auth: { agentToken: config.agentToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30_000,
  });

  socket.on('connect', () => onStatus('connected'));
  socket.on('disconnect', (reason) => onStatus('disconnected', reason));
  socket.on('connect_error', (err) => onStatus('error', err.message));

  socket.on('print:job', async ({ jobId, ticket }: { jobId: string; ticket: string }) => {
    try {
      await printTicket(config.printerIp, config.printerPort, ticket);
      // Acknowledge success
      socket?.emit('print:ack', { jobId, success: true });
      onPrint(jobId, true);
    } catch (err: any) {
      const errorMsg = err?.message ?? 'Unknown error';
      // Acknowledge failure — backend will retry or mark FAILED
      socket?.emit('print:ack', { jobId, success: false, error: errorMsg });
      onPrint(jobId, false, errorMsg);
    }
  });
}

export function stopSocketAgent(): void {
  socket?.disconnect();
  socket = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/printer-agent/src/services/socket.service.ts
git commit -m "feat(printer-agent): socket service with print:ack on success/failure"
```

---

### Task 15: Foreground Service + Status Screen + App Entry

**Files:**
- Create: `apps/printer-agent/src/screens/StatusScreen.tsx`
- Modify: `apps/printer-agent/App.tsx`

- [ ] **Step 1: Create StatusScreen**

```tsx
// apps/printer-agent/src/screens/StatusScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ScrollView, AppState,
} from 'react-native';
import VIForegroundService from '@supersami/rn-foreground-service';
import { startSocketAgent, stopSocketAgent, AgentStatus } from '../services/socket.service';
import { AgentConfig, clearConfig } from '../store/config';

interface Props { config: AgentConfig; onReset: () => void; }
interface LogEntry { time: string; message: string; ok: boolean; }

const STATUS_COLOR: Record<AgentStatus, string> = {
  connected: '#22c55e',
  connecting: '#6366f1',
  disconnected: '#f59e0b',
  error: '#ef4444',
};

export default function StatusScreen({ config, onReset }: Props) {
  const [status, setStatus] = useState<AgentStatus>('connecting');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [printCount, setPrintCount] = useState(0);
  const [failCount, setFailCount] = useState(0);

  const addLog = (message: string, ok: boolean) => {
    const time = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    setLogs((prev) => [{ time, message, ok }, ...prev].slice(0, 100));
  };

  useEffect(() => {
    VIForegroundService.getInstance().startService({
      id: 1001,
      title: `Print Agent — ${config.stationName}`,
      text: 'Listening for orders...',
      icon: 'ic_notification',
      importance: 'low',
    });

    startSocketAgent(
      config,
      (s, detail) => {
        setStatus(s);
        addLog(detail ? `${s}: ${detail}` : s, s === 'connected');
      },
      (jobId, success, error) => {
        if (success) {
          setPrintCount((n) => n + 1);
          addLog(`✓ Printed job ${jobId.slice(-6)}`, true);
        } else {
          setFailCount((n) => n + 1);
          addLog(`✗ Failed job ${jobId.slice(-6)}: ${error}`, false);
        }
      },
    );

    return () => {
      stopSocketAgent();
      VIForegroundService.getInstance().stopService();
    };
  }, []);

  const handleReset = async () => {
    stopSocketAgent();
    await clearConfig();
    onReset();
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.title}>{config.stationName}</Text>
        <View style={[styles.dot, { backgroundColor: STATUS_COLOR[status] }]} />
      </View>
      <Text style={styles.statusText}>{status}</Text>
      <Text style={styles.printer}>{config.printerIp}:{config.printerPort}</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{printCount}</Text>
          <Text style={styles.statLabel}>Printed</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, failCount > 0 && styles.red]}>{failCount}</Text>
          <Text style={styles.statLabel}>Failed</Text>
        </View>
      </View>

      <ScrollView style={styles.log}>
        {logs.map((l, i) => (
          <Text key={i} style={[styles.logLine, { color: l.ok ? '#4ade80' : '#f87171' }]}>
            {l.time}  {l.message}
          </Text>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
        <Text style={styles.resetText}>Reset Configuration</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700', color: '#fff' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  statusText: { fontSize: 13, color: '#888', marginTop: 4, textTransform: 'capitalize' },
  printer: { fontSize: 12, color: '#555', marginTop: 2, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 24, marginBottom: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 28, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 11, color: '#666' },
  red: { color: '#ef4444' },
  log: { flex: 1, backgroundColor: '#0a0a1a', borderRadius: 8, padding: 12, marginBottom: 8 },
  logLine: { fontSize: 11, fontFamily: 'monospace', marginBottom: 3 },
  resetBtn: { padding: 12, alignItems: 'center' },
  resetText: { color: '#ef4444', fontSize: 13 },
});
```

- [ ] **Step 2: Rewrite App.tsx**

```tsx
// apps/printer-agent/App.tsx
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { AgentConfig, loadConfig } from './src/store/config';
import SetupScreen from './src/screens/SetupScreen';
import StatusScreen from './src/screens/StatusScreen';

export default function App() {
  const [config, setConfig] = useState<AgentConfig | null | 'loading'>('loading');

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  if (config === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f0f23', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#6366f1" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {!config
        ? <SetupScreen onComplete={setConfig} />
        : <StatusScreen config={config} onReset={() => setConfig(null)} />
      }
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/printer-agent/App.tsx apps/printer-agent/src/screens/
git commit -m "feat(printer-agent): foreground service, status screen with print/fail counters"
```

---

### Task 16: Build APK

- [ ] **Step 1: Install EAS CLI and login**

```bash
npm install -g eas-cli
eas login
```

- [ ] **Step 2: Build debug APK**

```bash
cd apps/printer-agent
eas build --platform android --profile preview
```

Expected: EAS prints a download URL for the `.apk`. Takes ~10 minutes on EAS free tier.

- [ ] **Step 3: Test on Android device**

```
On Android device:
Settings → Security → Install unknown apps → Browser → Allow
Open APK download URL in browser → Install
```

Open the app, enter:
- Server URL: `https://your-cloudrun.app`
- Agent Token: (paste from dashboard)
- Printer IP: (local network IP of thermal printer)
- Port: 9100

Status screen should show `connected` and green dot within 3 seconds.

- [ ] **Step 4: End-to-end test**

1. From dashboard, assign a menu category to the print station
2. Place a test order via the QR menu
3. Status screen shows `✓ Printed job XXXXXX`
4. Physical printer produces a ticket

- [ ] **Step 5: Commit**

```bash
git add apps/printer-agent/eas.json
git commit -m "feat(printer-agent): EAS build config for APK distribution"
```

---

## Self-Review

### Spec Coverage
- ✅ `PrintJob` DB model — PENDING / SENT / PRINTED / FAILED
- ✅ Job created PENDING before emit — never silently lost
- ✅ `emitPrintJob` returns `boolean` — true only if room has a live agent socket
- ✅ Job stays PENDING if no agent online — picked up on reconnect
- ✅ `retryPendingJobs` — called on every agent connect, replays PENDING + stale SENT jobs
- ✅ Stale SENT threshold — 30s without ack triggers retry
- ✅ Max 3 attempts — permanently FAILED after 3rd failure
- ✅ `print:ack` — agent acknowledges success or failure via socket event
- ✅ `handlePrintAck` — updates job status; resets to PENDING for retry if under max attempts
- ✅ Dashboard health endpoint (`GET /print-stations/health`) — per-station pending/failed counts
- ✅ Health badges in `PrintStationsView` — green/amber/red, polls every 15s
- ✅ Expo agent emits `print:ack {jobId, success, error?}` in socket service
- ✅ Status screen shows printed + failed counters per session
- ✅ `touchLastSeen` updates token's `lastSeenAt` — dashboard uses this to detect offline agents
- ✅ Foreground Service — `@supersami/rn-foreground-service` keeps Android app alive 24/7
- ✅ Auto-reconnect — `reconnectionAttempts: Infinity`, exponential backoff up to 30s
- ✅ Fire-and-forget routing in OrdersService — print failure never breaks order creation

### Circular Dependency Note
`PrintStationModule` ↔ `EventsModule` is a known circular dependency. Both module files use `forwardRef(() => ...)` in their imports array. This is documented in Task 7 Step 5. NestJS resolves this at runtime without issue.

### Known Limitations
- **iOS** — foreground service is Android-only. iOS will eventually kill the app in background. Restaurant should use Android device.
- **`findByOwner`** must exist on `RestaurantsService`. If not present, add `findByOwner(userId: string)` that returns `this.prisma.restaurant.findFirst({ where: { ownerId: userId } })`.
- **CORS** — React Native socket clients send no `Origin` header. The existing `!origin` guard in `wsOrigin` already allows this. No change needed.
