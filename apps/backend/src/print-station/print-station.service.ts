import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CRON_DAILY, CRON_EVERY_MINUTE } from '../common/cron-schedules';
import type { WrapperType } from '../common/wrapper-type';
import type { ReceiptTemplate } from './escpos.util';
import { createHash, randomBytes } from 'crypto';
import type { Prisma, PrintJob, PrintJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrintStationDto } from './dto/create-print-station.dto';
import { UpdatePrintStationDto } from './dto/update-print-station.dto';
import { buildEscPosTicket, PrintItem } from './escpos.util';
import { EventsGateway } from '../events/events.gateway';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';

const MAX_PRINT_ATTEMPTS = 3;
const STALE_SENT_MS = 30_000;
const PRINT_CLAIM_LEASE_MS = 45_000;
const MAX_UNDELIVERED_JOB_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_AGENT_TOKENS_PER_STATION = 5;
const PRINTED_JOB_RETENTION_DAYS = 30;
const FAILED_JOB_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// Print agents retire on INACTIVITY, never on a calendar date. The agent runs
// unattended on a kitchen device, so an expiry that lands mid-service stops
// tickets at the worst possible moment -- a worse outcome than the stale
// credential it was meant to prevent. Silence, by contrast, is real evidence:
// a device that has not connected in months is lost, replaced or scrapped.
//
// Warning is advisory and never blocks. Only quarantine revokes.
const PRINT_AGENT_STALE_WARN_DAYS = 90;
const PRINT_AGENT_QUARANTINE_DAYS = 180;

// Each token carries its own `stalenessEnforcedAt`, written at creation and
// backfilled for pre-existing rows, so the grace period is a property of the
// data rather than a calendar date compiled into this file. A hardcoded date is
// wrong in every environment except the one it was written for -- staging, a
// fresh self-host, or a restore all inherit a window that began before their
// data existed.
const PRINT_AGENT_GRACE_DAYS = 90;

@Injectable()
export class PrintStationService {
  private readonly logger = new Logger(PrintStationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly events: WrapperType<EventsGateway>,
    private readonly featureService: FeatureService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async claimAndEmitJob(job: {
    id: string;
    restaurantId: string;
    printStationId: string | null;
    ticketBase64: string;
    status: PrintJobStatus;
    attempts: number;
    lastAttemptAt: Date | null;
    assignedAgentTokenId: string | null;
  }): Promise<boolean> {
    if (!job.printStationId || job.attempts >= MAX_PRINT_ATTEMPTS) return false;

    const now = new Date();
    const deliveryToken = randomBytes(24).toString('hex');
    const claimExpiresAt = new Date(now.getTime() + PRINT_CLAIM_LEASE_MS);
    const claim = await this.prisma.printJob.updateMany({
      where: {
        id: job.id,
        status: job.status,
        attempts: { lt: MAX_PRINT_ATTEMPTS },
        ...(job.lastAttemptAt && { lastAttemptAt: job.lastAttemptAt }),
        OR: [
          { claimToken: null },
          { claimExpiresAt: null },
          { claimExpiresAt: { lt: now } },
        ],
      },
      data: { claimToken: deliveryToken, claimExpiresAt },
    });
    if (claim.count === 0) return false;

    try {
      const assignedAgentTokenId = await this.events.findPrintAgentToken(
        job.restaurantId,
        job.printStationId,
        job.assignedAgentTokenId,
      );
      if (!assignedAgentTokenId) {
        await this.prisma.printJob.updateMany({
          where: { id: job.id, claimToken: deliveryToken },
          data: { claimToken: null, claimExpiresAt: null },
        });
        return false;
      }

      if (!job.assignedAgentTokenId) {
        const assigned = await this.prisma.printJob.updateMany({
          where: {
            id: job.id,
            claimToken: deliveryToken,
            assignedAgentTokenId: null,
          },
          data: { assignedAgentTokenId },
        });
        if (assigned.count !== 1) {
          await this.prisma.printJob.updateMany({
            where: { id: job.id, claimToken: deliveryToken },
            data: { claimToken: null, claimExpiresAt: null },
          });
          return false;
        }
      }

      const emitted = await this.events.emitPrintJob(
        job.restaurantId,
        job.printStationId,
        job.id,
        job.ticketBase64,
        deliveryToken,
        assignedAgentTokenId,
      );
      if (!emitted) {
        await this.prisma.printJob.updateMany({
          where: { id: job.id, claimToken: deliveryToken },
          data: { claimToken: null, claimExpiresAt: null },
        });
        return false;
      }

      await this.prisma.printJob.updateMany({
        where: { id: job.id, claimToken: deliveryToken },
        data: {
          status: 'SENT',
          attempts: { increment: 1 },
          lastAttemptAt: now,
          claimExpiresAt,
          outcomeUncertain: false,
        },
      });
      return true;
    } catch (error) {
      await this.prisma.printJob.updateMany({
        where: { id: job.id, claimToken: deliveryToken },
        data: { claimToken: null, claimExpiresAt: null },
      });
      throw error;
    }
  }

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
    if (existing)
      throw new ConflictException(`Station "${dto.name}" already exists`);

    return this.prisma.printStation.create({
      data: {
        restaurantId,
        name: dto.name,
        printerIp: dto.printerIp,
        printerPort: dto.printerPort ?? 9100,
      },
    });
  }

  async update(
    restaurantId: string,
    stationId: string,
    dto: UpdatePrintStationDto,
  ) {
    await this.assertOwnership(restaurantId, stationId);
    return this.prisma.printStation.update({
      where: { id: stationId },
      data: dto as any,
    });
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
    return this.prisma.$transaction(async (tx) => {
      const stations = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM print_station
        WHERE id = ${stationId} AND "restaurantId" = ${restaurantId}
        FOR UPDATE
      `;
      if (stations.length === 0) {
        throw new NotFoundException('Print station not found');
      }

      const tokenCount = await tx.printAgentToken.count({
        where: { printStationId: stationId },
      });
      if (tokenCount >= MAX_AGENT_TOKENS_PER_STATION) {
        throw new ConflictException(
          `Station already has the maximum of ${MAX_AGENT_TOKENS_PER_STATION} agent tokens`,
        );
      }
      // C-1: cryptographically random token — not guessable
      const token = randomBytes(32).toString('hex');
      const record = await tx.printAgentToken.create({
        data: {
          restaurantId,
          printStationId: stationId,
          label,
          tokenHash: this.hashToken(token),
          // A token is generated before anyone walks it over to the device and
          // enters it, so its grace window starts now rather than at first
          // connect -- otherwise a token issued and installed a week later
          // would be judged against a window it never had.
          stalenessEnforcedAt: new Date(
            Date.now() + PRINT_AGENT_GRACE_DAYS * DAY_MS,
          ),
        },
        select: {
          id: true,
          restaurantId: true,
          printStationId: true,
          label: true,
          lastSeenAt: true,
          createdAt: true,
        },
      });
      return { ...record, token };
    });
  }

  async revokeToken(restaurantId: string, tokenId: string) {
    const record = await this.prisma.printAgentToken.findFirst({
      where: { id: tokenId, restaurantId },
    });
    if (!record) throw new NotFoundException('Token not found');
    await this.prisma.printAgentToken.delete({ where: { id: tokenId } });
    // M-4: Disconnect any live agent sessions still using this token
    await this.events.disconnectAgentByTokenId(
      record.restaurantId,
      record.printStationId,
      tokenId,
    );
  }

  async validateAgentToken(token: string) {
    const record = await this.prisma.printAgentToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: {
        printStation: true,
        restaurant: { select: { tier: true, forceTier: true } },
      },
    });
    if (
      !record ||
      // Quarantined: the device behind this token has been silent past the
      // retirement window, so it is no longer a credential.
      record.quarantinedAt ||
      !this.featureService.restaurantHasFeature(
        record.restaurant,
        FeatureFlag.PRINTERS_THERMAL,
      )
    ) {
      return null;
    }

    // Connecting proves the device is alive. Clearing the warning here is what
    // stops a printer that was merely idle over a quiet period from maturing
    // into a quarantine once it comes back.
    if (record.staleWarnedAt) {
      await this.prisma.printAgentToken.update({
        where: { id: record.id },
        data: { staleWarnedAt: null },
      });
    }

    return record;
  }

  /**
   * Bring a quarantined agent back without re-flashing the device.
   *
   * Quarantine is a judgement made from silence, and silence can be innocent --
   * a seasonal closure, a station boxed up over a refit. The owner needs a way
   * home that is cheaper than issuing and physically re-entering a new token.
   */
  async reactivateAgentToken(restaurantId: string, tokenId: string) {
    const record = await this.prisma.printAgentToken.findFirst({
      where: { id: tokenId, restaurantId },
    });
    if (!record) throw new NotFoundException('Token not found');

    // lastSeenAt is deliberately reset too: without it the token is instantly
    // re-eligible for quarantine on the next sweep, before the agent has had
    // any chance to reconnect.
    const now = new Date();
    // One update, so a token is never briefly un-quarantined but still warned.
    // lastSeenAt is reset because otherwise the very next sweep would re-judge
    // it on the same silence it was just forgiven for, and the grace window is
    // restarted so the owner has time to get the agent reconnected.
    return this.prisma.printAgentToken.update({
      where: { id: tokenId },
      data: {
        quarantinedAt: null,
        staleWarnedAt: null,
        lastSeenAt: now,
        stalenessEnforcedAt: new Date(
          now.getTime() + PRINT_AGENT_GRACE_DAYS * DAY_MS,
        ),
      },
    });
  }

  /**
   * Retire print-agent tokens whose devices have gone silent.
   *
   * Two stages, deliberately: a warning the owner can act on, and only later a
   * quarantine that actually revokes. Nothing here can interrupt a working
   * printer -- a token that is connecting is, by definition, being seen.
   *
   * `lastSeenAt` is null until an agent first connects, so age falls back to
   * `createdAt`. Without that a token issued and never used would never be
   * touched, which is exactly the credential most worth retiring.
   */
  @Cron(CRON_DAILY.PRINT_AGENT_RETIREMENT, {
    name: 'retireStalePrintAgents',
    waitForCompletion: true,
  })
  async retireStalePrintAgents(now = new Date()): Promise<{
    warned: number;
    quarantined: number;
  }> {
    const unseenSince = (days: number) => new Date(now.getTime() - days * DAY_MS);

    // A live socket is the strongest possible evidence the device is alive, and
    // it outranks a lastSeenAt that has not moved because the station simply
    // has not printed. Refresh before judging, never after.
    try {
      const connected = await this.events.listConnectedAgentTokenIds();
      if (connected.length) {
        await this.prisma.printAgentToken.updateMany({
          where: { id: { in: connected } },
          data: { lastSeenAt: now, staleWarnedAt: null },
        });
      }
    } catch (error) {
      // If the socket layer cannot answer, skip the sweep entirely rather than
      // quarantine agents we simply failed to ask about.
      this.logger.error(
        `Could not enumerate connected print agents; skipping retirement sweep: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { warned: 0, quarantined: 0 };
    }

    const silentBefore = (cutoff: Date) => ({
      OR: [
        { lastSeenAt: { lt: cutoff } },
        { lastSeenAt: null, createdAt: { lt: cutoff } },
      ],
    });

    try {
      // Quarantine first: a token past the longer window should not be merely
      // warned on this pass and revoked a day later.
      const quarantined = await this.prisma.printAgentToken.updateMany({
        where: {
          quarantinedAt: null,
          // Per-token enforcement. NULL is the deployment-compatibility state
          // for rows created between deploy and backfill, and is deliberately
          // excluded: never quarantine a token whose grace window is unknown.
          stalenessEnforcedAt: { not: null, lte: now },
          ...silentBefore(unseenSince(PRINT_AGENT_QUARANTINE_DAYS)),
        },
        data: { quarantinedAt: now },
      });

      const warned = await this.prisma.printAgentToken.updateMany({
        where: {
          staleWarnedAt: null,
          quarantinedAt: null,
          ...silentBefore(unseenSince(PRINT_AGENT_STALE_WARN_DAYS)),
        },
        data: { staleWarnedAt: now },
      });

      if (quarantined.count || warned.count) {
        this.logger.log(
          `Print agent retirement: warned ${warned.count}, quarantined ${quarantined.count}`,
        );
      }
      return { warned: warned.count, quarantined: quarantined.count };
    } catch (error) {
      // A failed sweep must not take down the scheduler; the next run retries.
      this.logger.error(
        `Print agent retirement sweep failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { warned: 0, quarantined: 0 };
    }
  }

  async touchLastSeen(token: string) {
    await this.prisma.printAgentToken
      .update({
        where: { tokenHash: this.hashToken(token) },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => undefined);
  }

  async touchLastSeenById(tokenId: string) {
    await this.prisma.printAgentToken
      .update({ where: { id: tokenId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  // ─── Order Routing ────────────────────────────────────────────────────────

  async createPrintJobsForOrder(
    orderId: string,
    database?: Pick<Prisma.TransactionClient, 'order' | 'printJob'>,
  ): Promise<PrintJob[]> {
    if (!database) {
      return this.prisma.$transaction((tx) =>
        this.createPrintJobsForOrder(orderId, tx),
      );
    }
    const order = await database.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: { select: { tier: true, forceTier: true } },
        staff: { select: { name: true } },
        tableSession: { select: { createdAt: true } },
        items: {
          include: {
            menuItem: {
              include: { category: { include: { printStation: true } } },
            },
          },
        },
      },
    });
    if (!order) return [];
    if (
      !this.featureService.restaurantHasFeature(
        order.restaurant,
        FeatureFlag.PRINTERS_THERMAL,
      )
    ) {
      return [];
    }

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
        price: item.menuItem?.price ?? 0,
        options,
        notes: (item as any).notes || null,
      });
    }

    const jobs = [];
    for (const [stationId, { station, items }] of stationMap) {
      const template = (station.receiptTemplate as ReceiptTemplate) ?? {};
      const ticket = buildEscPosTicket({
        stationName: station.name,
        orderShortId: order.id.slice(-6).toUpperCase(),
        tableName: order.tableName,
        customerName: order.customerName,
        staffName: order.staff?.name ?? null,
        sessionOpened: order.tableSession?.createdAt ?? null,
        orderCreatedAt: order.createdAt,
        source: order.source,
        items,
        timestamp: new Date(),
        specialRequests: (order as any).specialRequests ?? null,
        template,
      });

      const ticketBase64 = ticket.toString('base64');

      const deduplicationKey = `${orderId}:${stationId}`;
      const job = await database.printJob.upsert({
        where: { deduplicationKey },
        create: {
          deduplicationKey,
          restaurantId: order.restaurantId,
          printStationId: stationId,
          orderId,
          ticketBase64,
          status: 'PENDING',
          attempts: 0,
        },
        update: {},
      });
      jobs.push(job);
    }
    return jobs;
  }

  async routeOrderToPrinters(orderId: string): Promise<void> {
    const jobs = await this.createPrintJobsForOrder(orderId);
    for (const job of jobs.filter(
      (candidate) => candidate.status === 'PENDING',
    )) {
      const emitted = await this.claimAndEmitJob(job);
      if (emitted) {
        this.logger.log(`Print job ${job.id} sent`);
      } else {
        this.logger.warn(
          `No assigned print agent is connected — job ${job.id} remains PENDING`,
        );
      }
    }
  }

  @Cron(CRON_EVERY_MINUTE.PRINT_RECONCILE_MISSING_JOBS, {
    name: 'reconcileMissingOrderPrintJobs',
    waitForCompletion: true,
  })
  async reconcileMissingOrderPrintJobs(now = new Date()): Promise<number> {
    const recentCutoff = new Date(now.getTime() - MAX_UNDELIVERED_JOB_AGE_MS);
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: recentCutoff },
        status: { notIn: ['PENDING_PAYMENT', 'CANCELED'] },
        printJobs: { none: {} },
        items: {
          some: {
            menuItem: { category: { printStationId: { not: null } } },
          },
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const results = await Promise.allSettled(
      orders.map((order) => this.routeOrderToPrinters(order.id)),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Failed to reconcile print routing for order ${orders[index].id}`,
          result.reason,
        );
      }
    });
    return results.filter((result) => result.status === 'fulfilled').length;
  }

  // ─── Retry on Agent Reconnect ─────────────────────────────────────────────

  async retryPendingJobs(
    restaurantId: string,
    stationId: string,
  ): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { tier: true, forceTier: true },
    });
    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.PRINTERS_THERMAL,
      )
    ) {
      return;
    }

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

    this.logger.log(
      `Retrying ${jobs.length} pending job(s) for station ${stationId}`,
    );

    for (const job of jobs) {
      await this.claimAndEmitJob(job);
    }
  }

  @Cron(CRON_EVERY_MINUTE.PRINT_RETRY_STUCK_JOBS, {
    name: 'retryStuckPrintJobs',
    waitForCompletion: true,
  })
  async retryStuckPrintJobs(): Promise<void> {
    const staleThreshold = new Date(Date.now() - STALE_SENT_MS);
    const wallClockThreshold = new Date(
      Date.now() - MAX_UNDELIVERED_JOB_AGE_MS,
    );

    try {
      await this.prisma.$transaction([
        this.prisma.printJob.updateMany({
          where: {
            status: 'PENDING',
            createdAt: { lt: wallClockThreshold },
          },
          data: {
            status: 'FAILED',
            outcomeUncertain: false,
            errorMessage: 'Print job expired before a delivery was confirmed',
          },
        }),
        this.prisma.printJob.updateMany({
          where: {
            status: 'SENT',
            createdAt: { lt: wallClockThreshold },
          },
          data: {
            status: 'FAILED',
            outcomeUncertain: true,
            errorMessage:
              'Print outcome is unknown after 24 hours without acknowledgement',
          },
        }),
      ]);
    } catch (error) {
      this.logger.error('Failed to expire old undelivered print jobs', error);
    }

    try {
      await this.prisma.printJob.updateMany({
        where: {
          status: 'SENT',
          attempts: { gte: MAX_PRINT_ATTEMPTS },
          lastAttemptAt: { lt: staleThreshold },
        },
        data: {
          status: 'FAILED',
          outcomeUncertain: true,
          errorMessage: 'Max retry attempts exhausted without ACK',
        },
      });
    } catch (error) {
      this.logger.error('Failed to finalize exhausted print jobs', error);
    }

    let stations: Array<{
      restaurantId: string;
      printStationId: string | null;
    }>;
    try {
      stations = await this.prisma.printJob.findMany({
        where: {
          printStationId: { not: null },
          attempts: { lt: MAX_PRINT_ATTEMPTS },
          createdAt: { gte: wallClockThreshold },
          OR: [
            { status: 'PENDING' },
            { status: 'SENT', lastAttemptAt: { lt: staleThreshold } },
          ],
        },
        select: { restaurantId: true, printStationId: true },
        distinct: ['restaurantId', 'printStationId'],
      });
    } catch (error) {
      this.logger.error('Failed to load print stations needing retries', error);
      return;
    }

    const retries = stations
      .filter((station) => station.printStationId)
      .map((station) =>
        this.retryPendingJobs(station.restaurantId, station.printStationId!),
      );

    const results = await Promise.allSettled(retries);
    results.forEach((result) => {
      if (result.status === 'rejected') {
        this.logger.warn('Scheduled print retry failed', result.reason);
      }
    });
  }

  // ─── Acknowledgement ──────────────────────────────────────────────────────

  async handlePrintAck(
    jobId: string,
    success: boolean,
    error?: string,
    printStationId?: string,
    restaurantId?: string,
    agentTokenId?: string,
    deliveryToken?: string,
    retryable = true,
  ): Promise<void> {
    if (!deliveryToken) return;
    const job = await this.prisma.printJob.findFirst({
      where: {
        id: jobId,
        claimToken: deliveryToken,
        ...(agentTokenId && { assignedAgentTokenId: agentTokenId }),
        ...(printStationId && { printStationId }),
        ...(restaurantId && { restaurantId }),
      },
    });
    if (!job) return;
    // Issue 30: ignore duplicate ACKs for terminal-state jobs.
    if (job.status === 'PRINTED' || job.status === 'FAILED') return;

    if (success) {
      await this.prisma.printJob.updateMany({
        where: {
          id: jobId,
          claimToken: deliveryToken,
          ...(agentTokenId && { assignedAgentTokenId: agentTokenId }),
          status: { in: ['PENDING', 'SENT'] },
        },
        data: {
          status: 'PRINTED',
          errorMessage: null,
          outcomeUncertain: false,
          claimToken: null,
          claimExpiresAt: null,
        },
      });
      // M-1: Touch lastSeen on successful print — agent is alive and printing
      if (agentTokenId) {
        void this.touchLastSeenById(agentTokenId);
      }
    } else {
      const permanentlyFailed =
        !retryable || job.attempts >= MAX_PRINT_ATTEMPTS;
      await this.prisma.printJob.updateMany({
        where: {
          id: jobId,
          claimToken: deliveryToken,
          ...(agentTokenId && { assignedAgentTokenId: agentTokenId }),
          status: { in: ['PENDING', 'SENT'] },
        },
        data: {
          status: permanentlyFailed ? 'FAILED' : 'PENDING',
          errorMessage: error ?? 'Unknown printer error',
          outcomeUncertain: !retryable,
          claimToken: null,
          claimExpiresAt: null,
          // An explicit NACK means the assigned agent itself confirms it did
          // not produce output — unlike a lost ACK, there is no ambiguity
          // about a possible duplicate physical print. Safe to release the
          // device pin so a retry (background or operator-triggered) can
          // route to any other agent connected at this station, instead of
          // being stuck waiting for this exact device to reconnect.
          ...(!permanentlyFailed && { assignedAgentTokenId: null }),
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

  @Cron('0 35 3 * * *', {
    name: 'printJobRetentionCleanup',
    waitForCompletion: true,
  })
  async cleanupOldPrintJobs(): Promise<void> {
    const printedCutoff = new Date(
      Date.now() - PRINTED_JOB_RETENTION_DAYS * DAY_MS,
    );
    const failedCutoff = new Date(
      Date.now() - FAILED_JOB_RETENTION_DAYS * DAY_MS,
    );

    const [printed, failed] = await this.prisma.$transaction([
      this.prisma.printJob.deleteMany({
        where: { status: 'PRINTED', createdAt: { lt: printedCutoff } },
      }),
      this.prisma.printJob.deleteMany({
        where: { status: 'FAILED', createdAt: { lt: failedCutoff } },
      }),
    ]);

    if (printed.count > 0 || failed.count > 0) {
      this.logger.log(
        `Print retention cleanup: printed=${printed.count}, failed=${failed.count}`,
      );
    }
  }

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
        outcomeUncertain: true,
        errorMessage: true,
        lastAttemptAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async retryFailedJob(restaurantId: string, stationId: string, jobId: string) {
    await this.assertOwnership(restaurantId, stationId);
    const job = await this.prisma.printJob.findFirst({
      where: { id: jobId, restaurantId, printStationId: stationId },
      select: { status: true, outcomeUncertain: true, orderId: true },
    });
    if (!job) throw new NotFoundException('Print job not found');
    if (job.status !== 'FAILED') {
      throw new ConflictException('Only failed print jobs can be retried');
    }
    if (job.outcomeUncertain) {
      throw new ConflictException(
        'Printer reconciliation is required before retrying this job',
      );
    }
    const updated = await this.prisma.printJob.updateMany({
      where: {
        id: jobId,
        restaurantId,
        printStationId: stationId,
        status: 'FAILED',
        outcomeUncertain: false,
      },
      data: {
        status: 'PENDING',
        attempts: 0,
        errorMessage: null,
        claimToken: null,
        claimExpiresAt: null,
        // This is the operator's explicit admin override: a job pinned to a
        // now-unreachable agent (lost/replaced device) would otherwise sit
        // PENDING forever, since findPrintAgentToken only matches sockets
        // whose agentTokenId equals the pin. outcomeUncertain is already
        // guaranteed false here, so there is no risk of routing a possibly-
        // already-printed job to a second device.
        assignedAgentTokenId: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'The print job state changed before it could be retried',
      );
    }
    void this.routeOrderToPrinters(job.orderId).catch((error: Error) =>
      this.logger.error(
        `Print retry failed for job ${jobId}: ${error.message}`,
      ),
    );
    return { id: jobId, status: 'PENDING' as const };
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
