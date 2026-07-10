import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHelpContentDto } from './dto/create-help-content.dto';
import { UpdateHelpContentDto } from './dto/update-help-content.dto';

@Injectable()
export class HelpContentService {
  constructor(private readonly prisma: PrismaService) {}

  findBySection(section: string) {
    return this.prisma.helpContent.findMany({
      where: { section },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findBySectionAndLocale(section: string, locale: string) {
    return this.prisma.helpContent.findMany({
      where: { section, locale, active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(dto: CreateHelpContentDto, actorUserId: string) {
    const created = await this.prisma.helpContent.create({
      data: {
        ...dto,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId,
        action: 'HELP_CONTENT_CREATE',
        targetType: 'HelpContent',
        targetId: created.id,
        metadata: { section: dto.section, locale: dto.locale },
      },
    });
    return created;
  }

  async update(id: string, dto: UpdateHelpContentDto, actorUserId: string) {
    const updated = await this.prisma.helpContent.update({
      where: { id },
      data: dto,
    });
    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId,
        action: 'HELP_CONTENT_UPDATE',
        targetType: 'HelpContent',
        targetId: id,
        metadata: { section: updated.section, locale: updated.locale },
      },
    });
    return updated;
  }

  async delete(id: string, actorUserId: string) {
    const existing = await this.prisma.helpContent.findUnique({
      where: { id },
      select: { section: true, locale: true },
    });
    await this.prisma.helpContent.delete({ where: { id } });
    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId,
        action: 'HELP_CONTENT_DELETE',
        targetType: 'HelpContent',
        targetId: id,
        metadata: existing
          ? { section: existing.section, locale: existing.locale }
          : undefined,
      },
    });
    return { deleted: true };
  }

  async reorder(
    items: { id: string; sortOrder: number }[],
    actorUserId: string,
  ) {
    if (items.length === 0) return { updated: 0 };

    await this.prisma.$transaction([
      ...items.map((i) =>
        this.prisma.helpContent.update({
          where: { id: i.id },
          data: { sortOrder: i.sortOrder },
        }),
      ),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'HELP_CONTENT_REORDER',
          targetType: 'HelpContent',
          targetId: items[0]?.id ?? 'unknown',
          metadata: { count: items.length },
        },
      }),
    ]);

    return { updated: items.length };
  }

  deleteByCategory(section: string, categoryKey: string) {
    return this.prisma.helpContent.deleteMany({
      where: { section, categoryKey },
    });
  }
}
