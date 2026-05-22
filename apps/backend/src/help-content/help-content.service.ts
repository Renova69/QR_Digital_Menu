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

  create(dto: CreateHelpContentDto) {
    return this.prisma.helpContent.create({
      data: {
        ...dto,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  update(id: string, dto: UpdateHelpContentDto) {
    return this.prisma.helpContent.update({
      where: { id },
      data: dto,
    });
  }

  delete(id: string) {
    return this.prisma.helpContent.delete({
      where: { id },
    });
  }

  async reorder(items: { id: string; sortOrder: number }[]) {
    await this.prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        this.prisma.helpContent.update({
          where: { id },
          data: { sortOrder },
        }),
      ),
    );
  }

  deleteByCategory(section: string, categoryKey: string) {
    return this.prisma.helpContent.deleteMany({
      where: { section, categoryKey },
    });
  }
}
