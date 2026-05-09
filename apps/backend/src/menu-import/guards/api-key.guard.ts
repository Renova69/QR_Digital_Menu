import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

    const token = authHeader.slice(7).trim();
    if (!token) return false;

    const restaurantId: string = request.params.id;
    if (!restaurantId) return false;

    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, importApiKey: token },
      select: { id: true },
    });

    return !!restaurant;
  }
}
