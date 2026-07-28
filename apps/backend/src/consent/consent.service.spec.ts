import { ConsentService } from './consent.service';

describe('ConsentService', () => {
  let service: ConsentService;
  const mockPrisma = {
    consentRecord: { create: jest.fn() },
  };

  beforeEach(() => {
    service = new ConsentService(mockPrisma as any);
    jest.clearAllMocks();
  });

  it('writes a consent record with a hashed ip, never the raw ip', async () => {
    mockPrisma.consentRecord.create.mockResolvedValue({});

    await service.recordConsent(
      {
        restaurantId: 'rest-1',
        visitorId: 'visitor-123',
        category: 'MARKETING',
        granted: true,
        policyVersion: 2,
      },
      '203.0.113.7',
    );

    expect(mockPrisma.consentRecord.create).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.consentRecord.create.mock.calls[0][0];
    expect(data.restaurantId).toBe('rest-1');
    expect(data.visitorId).toBe('visitor-123');
    expect(data.category).toBe('MARKETING');
    expect(data.granted).toBe(true);
    expect(data.policyVersion).toBe(2);
    expect(data.ipHash).toEqual(expect.any(String));
    expect(data.ipHash).not.toContain('203.0.113.7');
  });

  it('stores null restaurantId for platform-scoped consent', async () => {
    mockPrisma.consentRecord.create.mockResolvedValue({});

    await service.recordConsent(
      {
        visitorId: 'visitor-456',
        category: 'ANALYTICS',
        granted: false,
        policyVersion: 1,
      },
      '198.51.100.9',
    );

    const { data } = mockPrisma.consentRecord.create.mock.calls[0][0];
    expect(data.restaurantId).toBeNull();
  });

  it('swallows and logs errors instead of throwing', async () => {
    mockPrisma.consentRecord.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.recordConsent(
        {
          visitorId: 'visitor-789',
          category: 'ANALYTICS',
          granted: true,
          policyVersion: 1,
        },
        '198.51.100.10',
      ),
    ).resolves.toBeUndefined();
  });

  it('hashes an undefined ip deterministically instead of throwing', async () => {
    mockPrisma.consentRecord.create.mockResolvedValue({});

    await service.recordConsent(
      {
        visitorId: 'visitor-000',
        category: 'ANALYTICS',
        granted: true,
        policyVersion: 1,
      },
      undefined,
    );

    const { data } = mockPrisma.consentRecord.create.mock.calls[0][0];
    expect(data.ipHash).toEqual(expect.any(String));
  });
});
