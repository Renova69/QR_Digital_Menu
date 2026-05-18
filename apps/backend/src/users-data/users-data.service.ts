import {
  ForbiddenException,
  Injectable,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

@Injectable()
export class UsersDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async exportSelf(userId: string) {
    const settings = await this.platformSettings.getSettings();
    if (!settings.dataExportEndpointEnabled) {
      throw new ForbiddenException('Data export is not enabled on this platform.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const orders = await this.prisma.order.findMany({
      where: { customerId: userId },
      include: { items: true, feedback: true },
      orderBy: { createdAt: 'desc' },
    });
    const loyalty = await this.prisma.loyaltyAccount.findMany({
      where: { userId },
      include: { pointLedger: { take: 50, orderBy: { createdAt: 'desc' } } },
    });

    return {
      exportedAt: new Date().toISOString(),
      retentionNotice: `Order contact data is retained for ${settings.orderPiiRetentionYears} year(s) for tax and legal purposes.`,
      dataController: {
        name: settings.dataControllerName,
        email: settings.dataControllerEmail,
        address: settings.dataControllerAddress,
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
      },
      orders: orders.map((o) => ({
        id: o.id,
        restaurantId: o.restaurantId,
        totalPrice: o.totalPrice,
        status: o.status,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        specialRequests: o.specialRequests,
        pointsEarned: o.pointsEarned,
        pointsRedeemed: o.pointsRedeemed,
        createdAt: o.createdAt,
        items: o.items,
        feedback: o.feedback
          ? { rating: o.feedback.rating, comment: o.feedback.comment }
          : null,
      })),
      loyalty,
    };
  }

  async eraseSelf(userId: string) {
    const settings = await this.platformSettings.getSettings();
    if (!settings.erasureEndpointEnabled) {
      throw new ForbiddenException('Account deletion is not enabled on this platform.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const ownedRestaurants = await this.prisma.restaurant.count({
      where: { ownerId: userId },
    });
    if (ownedRestaurants > 0) {
      throw new ConflictException(
        'You own active restaurants. Transfer ownership or ask a super-admin to delete your tenants before requesting account deletion.',
      );
    }

    const userOrderIds = await this.prisma.order
      .findMany({ where: { customerId: userId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));

    await this.prisma.$transaction([
      this.prisma.feedback.updateMany({
        where: { orderId: { in: userOrderIds } },
        data: { comment: null },
      }),
      this.prisma.order.updateMany({
        where: { customerId: userId },
        data: {
          customerName: '[REDACTED]',
          customerPhone: null,
          specialRequests: null,
          customerId: null,
        },
      }),
      this.prisma.loyaltyAccount.deleteMany({ where: { userId } }),
      this.prisma.deviceEnrollmentToken.deleteMany({ where: { createdById: userId } }),
      this.prisma.verificationToken.deleteMany({ where: { email: user.email } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
  }
}
