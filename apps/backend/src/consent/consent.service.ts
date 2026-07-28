import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentCategory } from '@prisma/client';

interface RecordConsentInput {
  restaurantId?: string;
  visitorId: string;
  category: ConsentCategory;
  granted: boolean;
  policyVersion: number;
}

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(private prisma: PrismaService) {}

  // Fire-and-forget audit log, same precedent as MenuViewService.recordView:
  // never throws, the controller returns 204 regardless of outcome. This is
  // a public/anonymous write — no transaction, no admin-audit semantics.
  async recordConsent(data: RecordConsentInput, ip: string | undefined) {
    try {
      const ipHash = createHash('sha256')
        .update(`${ip ?? 'unknown'}:${process.env.JWT_SECRET ?? ''}`)
        .digest('hex');

      await this.prisma.consentRecord.create({
        data: {
          restaurantId: data.restaurantId ?? null,
          visitorId: data.visitorId,
          category: data.category,
          granted: data.granted,
          policyVersion: data.policyVersion,
          ipHash,
        },
      });
    } catch (err) {
      this.logger.error('Failed to record consent', err);
    }
  }
}
