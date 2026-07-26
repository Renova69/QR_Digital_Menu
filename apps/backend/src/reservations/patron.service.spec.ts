import { Test, TestingModule } from '@nestjs/testing';
import { PatronService } from './patron.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PatronService', () => {
  let service: PatronService;
  const mockPrisma = { patron: { update: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const m = await Test.createTestingModule({
      providers: [
        PatronService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = m.get<PatronService>(PatronService);
  });

  describe('matchOrCreate', () => {
    const mockTx = {
      patron: { findUnique: jest.fn(), create: jest.fn() },
    };

    it('returns existing patron when found', async () => {
      mockTx.patron.findUnique.mockResolvedValue({ id: 'pat-1' });

      const result = await service.matchOrCreate(
        mockTx as any,
        'r1',
        '+359888111',
        'John',
      );

      expect(result).toEqual({ id: 'pat-1' });
      expect(mockTx.patron.create).not.toHaveBeenCalled();
    });

    it('creates new patron when not found', async () => {
      mockTx.patron.findUnique.mockResolvedValue(null);
      mockTx.patron.create.mockResolvedValue({ id: 'pat-2' });

      const result = await service.matchOrCreate(
        mockTx as any,
        'r1',
        '+359888222',
        'Jane',
        'jane@example.com',
      );

      expect(result).toEqual({ id: 'pat-2' });
      expect(mockTx.patron.create).toHaveBeenCalledWith({
        data: {
          restaurantId: 'r1',
          phone: '+359888222',
          name: 'Jane',
          email: 'jane@example.com',
        },
        select: { id: true },
      });
    });

    it('handles P2002 duplicate by falling back to findUnique', async () => {
      mockTx.patron.findUnique.mockResolvedValueOnce(null);
      const p2002 = new Error('Unique') as any;
      p2002.code = 'P2002';
      mockTx.patron.create.mockRejectedValueOnce(p2002);
      mockTx.patron.findUnique.mockResolvedValueOnce({ id: 'pat-3' });

      const result = await service.matchOrCreate(
        mockTx as any,
        'r1',
        '+359888333',
        'Bob',
      );

      expect(result).toEqual({ id: 'pat-3' });
    });

    it('rethrows non-P2002 errors', async () => {
      mockTx.patron.findUnique.mockResolvedValue(null);
      mockTx.patron.create.mockRejectedValue(new Error('DB down'));

      await expect(
        service.matchOrCreate(mockTx as any, 'r1', '+359888444', 'Alice'),
      ).rejects.toThrow('DB down');
    });
  });

  describe('setStaffTags', () => {
    it('updates patron with sanitized tags', async () => {
      await service.setStaffTags('pat-1', ['VIP', 'regular']);

      expect(mockPrisma.patron.update).toHaveBeenCalledWith({
        where: { id: 'pat-1' },
        data: { staffTags: expect.any(Array) },
      });
    });
  });
});
