import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async auditMenu(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        menuCategories: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    const issues: any[] = [];
    const targetLanguages = restaurant.targetLanguages || [];

    restaurant.menuCategories.forEach((category) => {
      if (category.items.length === 0) {
        issues.push({
          type: 'error',
          message: 'Category is empty and will not display any items.',
          categoryId: category.id,
          field: 'items',
        });
      }

      if (targetLanguages.length > 0) {
        const translations = (category as any).translations || {};
        targetLanguages.forEach((lang) => {
          if (!translations[lang] || !translations[lang].name) {
            issues.push({
              type: 'warning',
              message: `Category is missing translation for ${lang.toUpperCase()}.`,
              categoryId: category.id,
              field: 'translations',
            });
          }
        });
      }

      category.items.forEach((item) => {
        if (item.price === 0) {
          issues.push({
            type: 'error',
            message: `Item price is set to 0.`,
            categoryId: category.id,
            itemId: item.id,
            field: 'price',
          });
        }

        if (!item.description || item.description.trim() === '') {
          issues.push({
            type: 'warning',
            message: `Item has no description. Descriptions help customers make choices.`,
            categoryId: category.id,
            itemId: item.id,
            field: 'description',
          });
        }

        if (!item.imageUrl) {
          issues.push({
            type: 'info',
            message: `Item has no image. Images increase sales by up to 30%.`,
            categoryId: category.id,
            itemId: item.id,
            field: 'imageUrl',
          });
        }

        if (targetLanguages.length > 0) {
          const translations = (item.translations as any) || {};
          targetLanguages.forEach((lang) => {
            if (!translations[lang] || !translations[lang].name) {
              issues.push({
                type: 'warning',
                message: `Item is missing translation for ${lang.toUpperCase()}.`,
                categoryId: category.id,
                itemId: item.id,
                field: 'translations',
              });
            }
          });
        }
      });
    });

    return issues;
  }
}
