import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { scopedWrite } from './scoped-write';

describe('scopedWrite', () => {
  it('preserves the mutation return value', async () => {
    const row = { id: 'row-1' };
    await expect(scopedWrite(Promise.resolve(row))).resolves.toBe(row);
  });

  it('maps only Prisma missing-row errors to 404', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('No scoped row', {
      code: 'P2025',
      clientVersion: '6',
    });
    await expect(scopedWrite(Promise.reject(error))).rejects.toThrow(
      NotFoundException,
    );
  });

  it.each([
    new Error('Database unavailable'),
    new Prisma.PrismaClientKnownRequestError('Transaction failed', {
      code: 'P2028',
      clientVersion: '6',
    }),
    Object.assign(new Error('Non-Prisma failure'), { code: 'P2025' }),
  ])('propagates other failures without relabeling them', async (error) => {
    await expect(scopedWrite(Promise.reject(error))).rejects.toBe(error);
  });
});
