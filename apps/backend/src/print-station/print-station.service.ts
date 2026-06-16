import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import type { WrapperType } from '../common/wrapper-type';
import { randomBytes } from 'crypto';
import type { PrintJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrintStationDto } from './dto/create-print-station.dto';
import { UpdatePrintStationDto } from './dto/update-print-station.dto';
import { buildEscPosTicket, PrintItem } from './escpos.util';
import { EventsGateway } from '../events/events.gateway';

const MAX_PRINT_ATTEMPTS = 3;
const STALE_SENT_MS = 30_000;

@Injectable()
export class PrintStationService {
  private readonly logger = new Logger(PrintStationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly events: WrapperType<EventsGateway>,
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
    const activeJobs = await this.prisma.printJob.count({
      where: { printStationId: stationId, status: { in: ['PENDING', 'SENT'] } },
    });
    if (activeJobs > 0) {
      throw new ConflictException(
        `Station has ${activeJobs} active print job(s). Wait for them to complete or disconnect the agent first.`,
      );
    }
    await this.prisma.printStation.delete({ where: { id: stationId } });
  }

  // ─── Agent Tokens ─────────────────────────────────────────────────────────

  async generateToken(restaurantId: string, stationId: string, label?: string) {
    await this.assertOwnership(restaurantId, stationId);
    // C-1: cryptographically random token — not guessable
    const token = randomBytes(32).toString('hex');
    return this.prisma.printAgentToken.create({
      data: { restaurantId, printStationId: stationId, label, token },
    });
  }

  async revokeToken(restaurantId: string, tokenId: string) {
    const record = await this.prisma.printAgentToken.findFirst({
      where: { id: tokenId, restaurantId },
    });
    if (!record) throw new NotFoundException('Token not found');
    await this.prisma.printAgentToken.delete({ where: { id: tokenId } });
    // M-4: Disconnect any live agent sessions still using this token
    await this.events.disconnectAgentByTokenId(record.restaurantId, record.printStationId, tokenId);
  }

  async validateAgentToken(token: string) {
    return this.prisma.printAgentToken.findUnique({
      where: { token },
      include: { printStation: true },
    });
  }

  async touchLastSeen(token: string) {
    await this.prisma.printAgentToken
      .update({ where: { token }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  async touchLastSeenById(tokenId: string) {
    await this.prisma.printAgentToken
      .update({ where: { id: tokenId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  // ─── Order Routing ────────────────────────────────────────────────────────

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
        specialRequests: (order as any).specialRequests ?? null,
      });

      const ticketBase64 = ticket.toString('base64');

      // H-1+H-3: Create with attempts:0, only increment on confirmed emit
      const job = await this.prisma.printJob.create({
        data: {
          restaurantId: order.restaurantId,
          printStationId: stationId,
          orderId,
          ticketBase64,
          status: 'PENDING',
          attempts: 0,
        },
      });

      const emitted = await this.events.emitPrintJob(order.restaurantId, stationId, job.id, ticketBase64);

      if (emitted) {
        await this.prisma.printJob.update({
          where: { id: job.id },
          data: { status: 'SENT', attempts: { increment: 1 }, lastAttemptAt: new Date() },
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

  async retryPendingJobs(restaurantId: string, stationId: string): Promise<void> {
    const staleThreshold = new Date(Date.now() - STALE_SENT_MS);

    const jobs = await this.prisma.printJob.findMany({
      where: {
        restaurantId,
        printStationId: stationId,
        attempts: { lt: MAX_PRINT_ATTEMPTS },
        OR: [
          { status: 'PENDING' },
          { status: 'SENT', lastAttemptAt: { lt: staleThreshold } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    if (jobs.length === 0) return;

    this.logger.log(`Retrying ${jobs.length} pending job(s) for station ${stationId}`);

    for (const job of jobs) {
      // H-2: only mark SENT when emit actually reached a socket
      const emitted = await this.events.emitPrintJob(restaurantId, stationId, job.id, job.ticketBase64);
      if (emitted) {
        await this.prisma.printJob.update({
          where: { id: job.id },
          data: { status: 'SENT', attempts: { increment: 1 }, lastAttemptAt: new Date() },
        });
      }
    }
  }

  // ─── Acknowledgement ──────────────────────────────────────────────────────

  async handlePrintAck(
    jobId: string,
    success: boolean,
    error?: string,
    printStationId?: string,
    restaurantId?: string,
    agentTokenId?: string,
  ): Promise<void> {
    const job = await this.prisma.printJob.findFirst({
      where: {
        id: jobId,
        ...(printStationId && { printStationId }),
        ...(restaurantId && { restaurantId }),
      },
    });
    if (!job) return;
    // Issue 30: ignore duplicate ACKs for terminal-state jobs.
    if (job.status === 'PRINTED' || job.status === 'FAILED') return;

    if (success) {
      await this.prisma.printJob.update({
        where: { id: jobId },
        data: { status: 'PRINTED', errorMessage: null },
      });
      // M-1: Touch lastSeen on successful print — agent is alive and printing
      if (agentTokenId) {
        void this.touchLastSeenById(agentTokenId);
      }
    } else {
      const permanentlyFailed = job.attempts >= MAX_PRINT_ATTEMPTS;
      await this.prisma.printJob.update({
        where: { id: jobId },
        data: {
          status: permanentlyFailed ? 'FAILED' : 'PENDING',
          errorMessage: error ?? 'Unknown printer error',
        },
      });

      if (permanentlyFailed) {
        this.logger.error(
          `Print job ${jobId} permanently FAILED after ${job.attempts} attempts: ${error}`,
        );
      }
    }
  }

  // ─── Print Job History ────────────────────────────────────────────────────

  async getJobs(restaurantId: string, stationId: string, status?: string) {
    await this.assertOwnership(restaurantId, stationId);
    return this.prisma.printJob.findMany({
      where: {
        restaurantId,
        printStationId: stationId,
        ...(status && { status: status as PrintJobStatus }),
      },
      select: {
        id: true,
        orderId: true,
        status: true,
        attempts: true,
        errorMessage: true,
        lastAttemptAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
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
        _count: {
          select: {
            printJobs: { where: { status: 'PENDING' } },
          },
        },
        printJobs: {
          where: { status: { in: ['FAILED', 'PRINTED'] } },
          select: { status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    return stations.map((s) => {
      const pending = s._count.printJobs;
      const failed = s.printJobs.filter((j) => j.status === 'FAILED').length;
      const lastPrinted =
        s.printJobs.find((j) => j.status === 'PRINTED')?.createdAt ?? null;
      // H-7: sort Date objects by time value, not string
      const lastSeen =
        s.agentTokens
          .map((t) => t.lastSeenAt)
          .filter((d): d is Date => d !== null)
          .sort((a, b) => a.getTime() - b.getTime())
          .at(-1) ?? null;

      return {
        id: s.id,
        name: s.name,
        isActive: s.isActive,
        pending,
        failed,
        lastPrinted,
        lastSeen,
      };
    });
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async assertOwnership(restaurantId: string, stationId: string) {
    const station = await this.prisma.printStation.findUnique({
      where: { id: stationId },
    });
    if (!station) throw new NotFoundException('Print station not found');
    if (station.restaurantId !== restaurantId) throw new ForbiddenException();
    return station;
  }
}
