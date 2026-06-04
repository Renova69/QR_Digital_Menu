import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { MenuAuditService } from './menu-audit.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  restaurant: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
};

const makeRestaurant = (overrides: object = {}) => ({
  id: 'rest-1',
  ownerId: 'owner-1',
  targetLanguages: [],
  menuCategories: [],
  ...overrides,
});

const makeCategory = (overrides: object = {}) => ({
  id: 'cat-1',
  name: 'Starters',
  items: [],
  translations: {},
  ...overrides,
});

const makeItem = (overrides: object = {}) => ({
  id: 'item-1',
  name: 'Soup',
  price: 5,
  description: 'Hot soup',
  imageUrl: 'https://example.com/img.webp',
  translations: {},
  ...overrides,
});

describe('MenuAuditService', () => {
  let service: MenuAuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuAuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MenuAuditService>(MenuAuditService);
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });
  });

  it('throws when restaurant not found', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(null);

    await expect(service.auditMenu('missing', 'owner-1')).rejects.toThrow(
      'Restaurant not found',
    );
  });

  it('throws ForbiddenException when caller does not own or staff the restaurant', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(makeRestaurant());
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-2' });

    await expect(service.auditMenu('rest-1', 'staff-2')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns empty issues for a fully complete menu', async () => {
    const item = makeItem();
    const category = makeCategory({ items: [item] });
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      makeRestaurant({ menuCategories: [category] }),
    );

    const issues = await service.auditMenu('rest-1', 'owner-1');

    expect(issues).toHaveLength(0);
  });

  it('adds error issue for empty category', async () => {
    const category = makeCategory({ items: [] });
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      makeRestaurant({ menuCategories: [category] }),
    );

    const issues = await service.auditMenu('rest-1', 'owner-1');

    const errorIssues = issues.filter(
      (i: any) => i.type === 'error' && i.field === 'items',
    );
    expect(errorIssues).toHaveLength(1);
    expect(errorIssues[0].categoryId).toBe('cat-1');
  });

  it('adds error issue for item with price 0', async () => {
    const item = makeItem({ price: 0 });
    const category = makeCategory({ items: [item] });
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      makeRestaurant({ menuCategories: [category] }),
    );

    const issues = await service.auditMenu('rest-1', 'owner-1');

    const priceError = issues.find(
      (i: any) => i.type === 'error' && i.field === 'price',
    );
    expect(priceError).toBeDefined();
    expect(priceError.itemId).toBe('item-1');
  });

  it('adds warning issue for item with no description', async () => {
    const item = makeItem({ description: '' });
    const category = makeCategory({ items: [item] });
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      makeRestaurant({ menuCategories: [category] }),
    );

    const issues = await service.auditMenu('rest-1', 'owner-1');

    const warn = issues.find(
      (i: any) => i.type === 'warning' && i.field === 'description',
    );
    expect(warn).toBeDefined();
  });

  it('adds info issue for item with no image', async () => {
    const item = makeItem({ imageUrl: null });
    const category = makeCategory({ items: [item] });
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      makeRestaurant({ menuCategories: [category] }),
    );

    const issues = await service.auditMenu('rest-1', 'owner-1');

    const info = issues.find(
      (i: any) => i.type === 'info' && i.field === 'imageUrl',
    );
    expect(info).toBeDefined();
  });

  it('adds translation warning for category missing a target language', async () => {
    const category = makeCategory({ items: [makeItem()], translations: {} });
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      makeRestaurant({ targetLanguages: ['ro'], menuCategories: [category] }),
    );

    const issues = await service.auditMenu('rest-1', 'owner-1');

    const transWarn = issues.find(
      (i: any) =>
        i.type === 'warning' && i.field === 'translations' && !i.itemId,
    );
    expect(transWarn).toBeDefined();
    expect(transWarn.categoryId).toBe('cat-1');
  });

  it('adds translation warning for item missing a target language', async () => {
    const item = makeItem({ translations: {} });
    const category = makeCategory({ items: [item] });
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      makeRestaurant({ targetLanguages: ['en'], menuCategories: [category] }),
    );

    const issues = await service.auditMenu('rest-1', 'owner-1');

    const transWarn = issues.find(
      (i: any) =>
        i.type === 'warning' &&
        i.field === 'translations' &&
        i.itemId === 'item-1',
    );
    expect(transWarn).toBeDefined();
  });

  it('does not add translation warnings when targetLanguages is empty', async () => {
    const item = makeItem({ translations: {} });
    const category = makeCategory({ items: [item], translations: {} });
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      makeRestaurant({ targetLanguages: [], menuCategories: [category] }),
    );

    const issues = await service.auditMenu('rest-1', 'owner-1');

    const transWarnings = issues.filter((i: any) => i.field === 'translations');
    expect(transWarnings).toHaveLength(0);
  });

  it('does not flag category translation when translation exists', async () => {
    const item = makeItem({ translations: { ro: { name: 'Supă' } } });
    const category = makeCategory({
      items: [item],
      translations: { ro: { name: 'Aperitive' } },
    });
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      makeRestaurant({ targetLanguages: ['ro'], menuCategories: [category] }),
    );

    const issues = await service.auditMenu('rest-1', 'owner-1');

    expect(issues).toHaveLength(0);
  });

  it('aggregates issues across multiple categories and items', async () => {
    const cat1 = makeCategory({ id: 'cat-1', items: [] });
    const cat2 = makeCategory({
      id: 'cat-2',
      items: [
        makeItem({ price: 0 }),
        makeItem({ id: 'item-2', description: '' }),
      ],
    });
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      makeRestaurant({ menuCategories: [cat1, cat2] }),
    );

    const issues = await service.auditMenu('rest-1', 'owner-1');

    expect(issues.length).toBeGreaterThanOrEqual(3);
  });
});
