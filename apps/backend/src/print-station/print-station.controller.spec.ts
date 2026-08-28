import { PrintStationController } from './print-station.controller';
import { PrintStationService } from './print-station.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { REQUIRE_FEATURE_KEY } from '../subscription/require-feature.decorator';
import { RestaurantAccessContext } from '../auth/restaurant-access.policy';

describe('PrintStationController feature contract', () => {
  it('requires Enterprise thermal-printer entitlement for every endpoint', () => {
    expect(
      Reflect.getMetadata(REQUIRE_FEATURE_KEY, PrintStationController),
    ).toEqual([FeatureFlag.PRINTERS_THERMAL]);
  });
});

describe('PrintStationController authorized dispatch', () => {
  const service = {
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
  const access: RestaurantAccessContext = {
    restaurantId: 'r1',
    userId: 'u1',
    role: 'OWNER',
    tier: 'ENTERPRISE',
    forceTier: null,
  };
  const controller = new PrintStationController(
    service as unknown as PrintStationService,
  );
  // Ownership, suspended/missing restaurants and owner fallback now run before
  // the controller; their old cases live in restaurant-access.guard/http.spec.
  beforeEach(() => jest.resetAllMocks());

  it('lists stations for the verified restaurant', async () => {
    service.list.mockResolvedValue([{ id: 's1' }]);
    expect(await controller.list(access)).toEqual([{ id: 's1' }]);
    expect(service.list).toHaveBeenCalledWith('r1');
  });
  it('returns station health', async () => {
    service.getStationHealth.mockResolvedValue({ online: 2 });
    expect(await controller.health(access)).toEqual({ online: 2 });
    expect(service.getStationHealth).toHaveBeenCalledWith('r1');
  });
  it('creates a station', async () => {
    const dto = { name: 'Kitchen', printerIp: '192.0.2.10' };
    await controller.create(access, dto);
    expect(service.create).toHaveBeenCalledWith('r1', dto);
  });
  it('updates a station', async () => {
    const dto = { name: 'Bar' };
    await controller.update(access, 's1', dto);
    expect(service.update).toHaveBeenCalledWith('r1', 's1', dto);
  });
  it('removes a station', async () => {
    expect(await controller.remove(access, 's1')).toEqual({ success: true });
    expect(service.remove).toHaveBeenCalledWith('r1', 's1');
  });
  it('lists jobs with the status filter', async () => {
    await controller.getJobs(access, 's1', 'FAILED');
    expect(service.getJobs).toHaveBeenCalledWith('r1', 's1', 'FAILED');
  });
  it('retries a failed job', async () => {
    await controller.retryJob(access, 's1', 'j1');
    expect(service.retryFailedJob).toHaveBeenCalledWith('r1', 's1', 'j1');
  });
  it('generates a token with its label', async () => {
    await controller.generateToken(access, 's1', { label: 'Agent 1' });
    expect(service.generateToken).toHaveBeenCalledWith('r1', 's1', 'Agent 1');
  });
  it('revokes a token for the verified restaurant', async () => {
    expect(await controller.revokeToken(access, 't1')).toEqual({
      success: true,
    });
    expect(service.revokeToken).toHaveBeenCalledWith('r1', 't1');
  });
  it('reactivates a token with exactly the same restaurant scoping', async () => {
    expect(await controller.reactivateToken(access, 't1')).toEqual({
      success: true,
    });
    expect(service.reactivateAgentToken).toHaveBeenCalledWith('r1', 't1');
  });
});
