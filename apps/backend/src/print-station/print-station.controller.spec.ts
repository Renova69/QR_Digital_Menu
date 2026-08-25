import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrintStationController } from './print-station.controller';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { REQUIRE_FEATURE_KEY } from '../subscription/require-feature.decorator';

describe('PrintStationController feature contract', () => {
  it('requires Enterprise thermal-printer entitlement for every endpoint', () => {
    expect(
      Reflect.getMetadata(REQUIRE_FEATURE_KEY, PrintStationController),
    ).toEqual([FeatureFlag.PRINTERS_THERMAL]);
  });
});

describe('PrintStationController behavior', () => {
  let service: {
    list: jest.Mock;
    getStationHealth: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    getJobs: jest.Mock;
    retryFailedJob: jest.Mock;
    generateToken: jest.Mock;
    revokeToken: jest.Mock;
    reactivateAgentToken: jest.Mock;
  };
  let restaurants: {
    findOne: jest.Mock;
    findByOwner: jest.Mock;
  };
  let controller: PrintStationController;

  const ownerReq = { user: { id: 'u1', role: 'OWNER' } } as any;

  beforeEach(() => {
    service = {
      list: jest.fn(),
      getStationHealth: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      getJobs: jest.fn(),
      retryFailedJob: jest.fn(),
      generateToken: jest.fn(),
      revokeToken: jest.fn(),
      reactivateAgentToken: jest.fn(),
    };
    restaurants = {
      findOne: jest.fn(),
      findByOwner: jest.fn(),
    };
    controller = new PrintStationController(service as any, restaurants as any);
  });

  describe('restaurant resolution', () => {
    it('resolves the explicit restaurant id and verifies it is active', async () => {
      restaurants.findOne.mockResolvedValue({ id: 'r1', isActive: true });
      service.list.mockResolvedValue([{ id: 's1' }]);

      const result = await controller.list(ownerReq, 'r1');

      expect(restaurants.findOne).toHaveBeenCalledWith('r1', 'u1');
      expect(service.list).toHaveBeenCalledWith('r1');
      expect(result).toEqual([{ id: 's1' }]);
    });

    it('rejects a suspended explicit restaurant', async () => {
      restaurants.findOne.mockResolvedValue({ id: 'r1', isActive: false });

      await expect(controller.list(ownerReq, 'r1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(service.list).not.toHaveBeenCalled();
    });

    it('forbids non-owner roles', async () => {
      await expect(
        controller.list({ user: { id: 'u1', role: 'MANAGER' } }, 'r1'),
      ).rejects.toThrow('Print station management requires OWNER role');
      expect(restaurants.findOne).not.toHaveBeenCalled();
    });

    it('falls back to the owner restaurant without an explicit id', async () => {
      restaurants.findByOwner.mockResolvedValue({ id: 'r9', isActive: true });
      service.list.mockResolvedValue([]);

      await controller.list(ownerReq);

      expect(restaurants.findByOwner).toHaveBeenCalledWith('u1');
      expect(service.list).toHaveBeenCalledWith('r9');
    });

    it('throws NotFound when the owner has no restaurant', async () => {
      restaurants.findByOwner.mockResolvedValue(null);

      await expect(controller.list(ownerReq)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects a suspended owner restaurant', async () => {
      restaurants.findByOwner.mockResolvedValue({ id: 'r9', isActive: false });

      await expect(controller.list(ownerReq)).rejects.toThrow(
        'Restaurant is suspended',
      );
    });
  });

  describe('endpoints', () => {
    beforeEach(() => {
      restaurants.findOne.mockResolvedValue({ id: 'r1', isActive: true });
    });

    it('returns station health', async () => {
      service.getStationHealth.mockResolvedValue({ online: 2 });
      const result = await controller.health(ownerReq, 'r1');
      expect(service.getStationHealth).toHaveBeenCalledWith('r1');
      expect(result).toEqual({ online: 2 });
    });

    it('creates a station', async () => {
      const dto = { name: 'Kitchen', category: 'KITCHEN' } as any;
      await controller.create(ownerReq, dto, 'r1');
      expect(service.create).toHaveBeenCalledWith('r1', dto);
    });

    it('updates a station', async () => {
      const dto = { name: 'Bar' } as any;
      await controller.update(ownerReq, 's1', dto, 'r1');
      expect(service.update).toHaveBeenCalledWith('r1', 's1', dto);
    });

    it('removes a station and returns success', async () => {
      service.remove.mockResolvedValue(undefined);
      const result = await controller.remove(ownerReq, 's1', 'r1');
      expect(service.remove).toHaveBeenCalledWith('r1', 's1');
      expect(result).toEqual({ success: true });
    });

    it('lists jobs with the status filter', async () => {
      service.getJobs.mockResolvedValue([]);
      await controller.getJobs(ownerReq, 's1', 'FAILED', 'r1');
      expect(service.getJobs).toHaveBeenCalledWith('r1', 's1', 'FAILED');
    });

    it('retries a failed job', async () => {
      await controller.retryJob(ownerReq, 's1', 'j1', 'r1');
      expect(service.retryFailedJob).toHaveBeenCalledWith('r1', 's1', 'j1');
    });

    it('generates a token with the label', async () => {
      const dto = { label: 'Agent 1' } as any;
      await controller.generateToken(ownerReq, 's1', dto, 'r1');
      expect(service.generateToken).toHaveBeenCalledWith('r1', 's1', 'Agent 1');
    });

    it('revokes a token and returns success', async () => {
      service.revokeToken.mockResolvedValue(undefined);
      const result = await controller.revokeToken(ownerReq, 't1', 'r1');
      expect(service.revokeToken).toHaveBeenCalledWith('r1', 't1');
      expect(result).toEqual({ success: true });
    });

    // Reactivation hands back a working credential, so it must be scoped to the
    // owning restaurant exactly as revocation is -- never the weaker of the two.
    it('reactivates a token scoped to the resolved restaurant', async () => {
      service.reactivateAgentToken.mockResolvedValue(undefined);
      const result = await controller.reactivateToken(ownerReq, 't1', 'r1');
      expect(service.reactivateAgentToken).toHaveBeenCalledWith('r1', 't1');
      expect(result).toEqual({ success: true });
    });
  });
});
