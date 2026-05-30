import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { createHash } from 'crypto';
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

    // Only the SHA-256 hash of the key is stored (#10) — hash the presented
    // token and match on that.
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, importApiKeyHash: tokenHash },
      select: { id: true },
    });

    return !!restaurant;
  }
}
