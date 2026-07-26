import { Test, TestingModule } from '@nestjs/testing';
import { ReservationAllergensService } from './reservation-allergens.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReservationAllergensService', () => {
  let service: ReservationAllergensService;
  const mockPrisma = { menuItem: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const m = await Test.createTestingModule({
      providers: [
        ReservationAllergensService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = m.get<ReservationAllergensService>(ReservationAllergensService);
  });

  it('aggregates allergens and dietary tags from active items', async () => {
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { allergens: ['gluten', 'dairy'], dietaryTags: ['vegan'] },
      { allergens: ['nuts', 'GLUTEN'], dietaryTags: ['vegetarian'] },
    ]);

    const result = await service.getMenuAllergenSummary('r1');

    expect(result.allergens).toEqual(['dairy', 'gluten', 'nuts']); // sorted, 'nuts' wins — first seen
    expect(result.dietaryTags).toEqual(['vegan', 'vegetarian']);
    expect(mockPrisma.menuItem.findMany).toHaveBeenCalledWith({
      where: { category: { restaurantId: 'r1' }, isOutOfStock: false },
      select: { allergens: true, dietaryTags: true },
    });
  });

  it('deduplicates case-insensitively', async () => {
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { allergens: ['Gluten', 'gluten', 'GLUTEN'], dietaryTags: [] },
    ]);

    const result = await service.getMenuAllergenSummary('r1');

    expect(result.allergens).toEqual(['Gluten']);
  });

  it('filters empty and whitespace-only values', async () => {
    mockPrisma.menuItem.findMany.mockResolvedValue([
      { allergens: ['', '  ', 'dairy'], dietaryTags: [null, 'vegan'] },
    ]);

    const result = await service.getMenuAllergenSummary('r1');

    expect(result.allergens).toEqual(['dairy']);
    expect(result.dietaryTags).toEqual(['vegan']);
  });

  it('returns empty arrays when no items', async () => {
    mockPrisma.menuItem.findMany.mockResolvedValue([]);
    const result = await service.getMenuAllergenSummary('r1');
    expect(result.allergens).toEqual([]);
    expect(result.dietaryTags).toEqual([]);
  });
});
