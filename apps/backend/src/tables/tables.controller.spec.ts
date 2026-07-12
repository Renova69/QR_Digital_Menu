import { BadRequestException } from '@nestjs/common';
import { TablesController } from './tables.controller';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { REQUIRE_FEATURE_KEY } from '../subscription/require-feature.decorator';

describe('TablesController subtype contracts', () => {
  const tablesService = { create: jest.fn() } as any;
  const controller = new TablesController(tablesService);
  const request = { user: { id: 'owner-1' } } as any;

  beforeEach(() => jest.clearAllMocks());

  it('forces the ordinary tables endpoint to create TABLE records', () => {
    controller.create(
      'restaurant-1',
      { name: 'Table 4', type: 'ROOM' },
      request,
    );

    expect(tablesService.create).toHaveBeenCalledWith(
      'restaurant-1',
      expect.objectContaining({ name: 'Table 4', type: 'TABLE' }),
      'owner-1',
    );
  });

  it('rejects TABLE records on the service-point endpoint', () => {
    expect(() =>
      controller.createServicePoint(
        'restaurant-1',
        { name: 'Hidden table', type: 'TABLE' },
        request,
      ),
    ).toThrow(BadRequestException);
    expect(tablesService.create).not.toHaveBeenCalled();
  });

  it.each(['createServicePoint', 'findServicePoints'] as const)(
    'requires the service-points feature for %s',
    (method) => {
      expect(
        Reflect.getMetadata(
          REQUIRE_FEATURE_KEY,
          TablesController.prototype[method],
        ),
      ).toEqual([FeatureFlag.SERVICE_POINTS]);
    },
  );
});
