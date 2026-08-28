import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** A scoped row/connection can disappear after authorization. Keep that a
 * non-disclosing 404, but do not hide unrelated database failures.
 * Inside a transaction, rejection must propagate so all its writes roll back.
 */
export async function scopedWrite<T>(query: PromiseLike<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('Resource not found or no longer accessible');
    }
    throw error;
  }
}
