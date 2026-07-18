import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDataRequestDto } from './dto/update-tenant.dto';
import { SuperAdminService } from './super-admin.service';

describe('GDPR data request compliance', () => {
  const actorUserId = 'admin-1';
  const requestId = 'request-1';

  const createHarness = () => {
    const request = {
      id: requestId,
      userId: 'customer-1',
      type: 'ERASURE',
      status: 'IN_PROGRESS',
      requestedAt: new Date('2026-07-01T00:00:00.000Z'),
      processedAt: null,
      processedByUserId: null,
      notes: null,
      downloadUrl: null,
    };
    const updated = {
      ...request,
      status: 'COMPLETED',
      processedAt: new Date('2026-07-18T12:00:00.000Z'),
      processedByUserId: actorUserId,
    };
    const tx = {
      dataRequest: {
        findUnique: jest.fn().mockResolvedValue(request),
        update: jest.fn().mockResolvedValue(updated),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
    };
    const service = new SuperAdminService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
    );

    return { prisma, request, service, tx, updated };
  };

  describe('UpdateDataRequestDto', () => {
    it.each(['COMPLETED', 'REJECTED'])(
      'requires exact CONFIRM for terminal status %s',
      async (status) => {
        const missing = Object.assign(new UpdateDataRequestDto(), { status });
        const wrong = Object.assign(new UpdateDataRequestDto(), {
          status,
          confirmation: 'confirm',
        });
        const valid = Object.assign(new UpdateDataRequestDto(), {
          status,
          confirmation: 'CONFIRM',
        });

        await expect(validate(missing)).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ property: 'confirmation' }),
          ]),
        );
        await expect(validate(wrong)).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ property: 'confirmation' }),
          ]),
        );
        await expect(validate(valid)).resolves.toHaveLength(0);
      },
    );

    it('does not require confirmation for non-terminal updates', async () => {
      const statusUpdate = Object.assign(new UpdateDataRequestDto(), {
        status: 'IN_PROGRESS',
      });
      const notesUpdate = Object.assign(new UpdateDataRequestDto(), {
        notes: 'Identity verified',
      });

      await expect(validate(statusUpdate)).resolves.toHaveLength(0);
      await expect(validate(notesUpdate)).resolves.toHaveLength(0);
    });
  });

  describe('updateDataRequest', () => {
    it('updates the request and writes a privacy-safe audit record in one transaction', async () => {
      const { prisma, service, tx, updated } = createHarness();

      await expect(
        service.updateDataRequest(
          requestId,
          {
            status: 'COMPLETED',
            notes: 'Sensitive internal details',
            confirmation: 'CONFIRM',
          },
          actorUserId,
        ),
      ).resolves.toEqual(updated);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.dataRequest.findUnique).toHaveBeenCalledWith({
        where: { id: requestId },
      });
      expect(tx.dataRequest.update).toHaveBeenCalledWith({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          notes: 'Sensitive internal details',
          processedAt: expect.any(Date),
          processedByUserId: actorUserId,
        },
      });
      expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          actorUserId,
          action: 'DATA_REQUEST_UPDATE',
          targetType: 'DATA_REQUEST',
          targetId: requestId,
          metadata: {
            changedFields: ['status', 'notes'],
            previousStatus: 'IN_PROGRESS',
            nextStatus: 'COMPLETED',
            terminalStatusConfirmed: true,
          },
        },
      });
      expect(
        tx.adminAuditLog.create.mock.calls[0][0].data.metadata,
      ).not.toHaveProperty('notes');
      expect(tx.dataRequest.update.mock.calls[0][0].data).not.toHaveProperty(
        'confirmation',
      );
    });

    it('rejects an unconfirmed terminal transition inside the transaction', async () => {
      const { service, tx } = createHarness();

      await expect(
        service.updateDataRequest(
          requestId,
          { status: 'REJECTED' },
          actorUserId,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CONFIRMATION_REQUIRED' }),
      });

      expect(tx.dataRequest.update).not.toHaveBeenCalled();
      expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
    });

    it('clears terminal processing metadata when a request is reopened', async () => {
      const { request, service, tx } = createHarness();
      tx.dataRequest.findUnique.mockResolvedValue({
        ...request,
        status: 'COMPLETED',
        processedAt: new Date('2026-07-17T00:00:00.000Z'),
        processedByUserId: 'admin-previous',
      });

      await service.updateDataRequest(
        requestId,
        { status: 'IN_PROGRESS' },
        actorUserId,
      );

      expect(tx.dataRequest.update).toHaveBeenCalledWith({
        where: { id: requestId },
        data: {
          status: 'IN_PROGRESS',
          processedAt: null,
          processedByUserId: null,
        },
      });
    });

    it('does not mutate or audit a missing request', async () => {
      const { service, tx } = createHarness();
      tx.dataRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.updateDataRequest(
          requestId,
          { notes: 'Reviewed' },
          actorUserId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(tx.dataRequest.update).not.toHaveBeenCalled();
      expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
    });

    it('propagates audit failure so the enclosing transaction can roll back', async () => {
      const { service, tx } = createHarness();
      tx.adminAuditLog.create.mockRejectedValue(new Error('audit unavailable'));

      await expect(
        service.updateDataRequest(
          requestId,
          { notes: 'Reviewed' },
          actorUserId,
        ),
      ).rejects.toThrow('audit unavailable');

      expect(tx.dataRequest.update).toHaveBeenCalledTimes(1);
      expect(tx.adminAuditLog.create).toHaveBeenCalledTimes(1);
    });
  });
});
