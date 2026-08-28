import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  NestInterceptor,
  Type,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantSlugService } from '../restaurants/slug/restaurant-slug.service';
import { StorageService } from '../storage/storage.service';
import {
  CategoryController,
  CategoryDetailController,
} from './category.controller';
import { ItemController, ItemDetailController } from './item.controller';
import {
  MenuOptionController,
  MenuOptionDetailController,
} from './menu-option.controller';
import { BulkItemController } from './bulk-item.controller';
import { PublicMenuController } from './public-menu.controller';
import { MenuAuditController } from './audit.controller';
import { MenuCrudService } from './menu-crud.service';
import { MenuBulkEditService } from './menu-bulk-edit.service';
import { MenuTranslationOverrideService } from './menu-translation-override.service';
import { MenuAuditService } from './menu-audit.service';

type RouteCase = {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  operation: string;
  body?: object;
  upload?: boolean;
};
const routes: RouteCase[] = [
  {
    method: 'post',
    path: '/restaurants/r1/categories',
    operation: 'createCategory',
    body: { name: 'Food' },
  },
  {
    method: 'get',
    path: '/restaurants/r1/categories',
    operation: 'findAllCategories',
  },
  {
    method: 'put',
    path: '/restaurants/r1/categories/order',
    operation: 'updateCategoryOrder',
    body: { orderedIds: ['category-1'] },
  },
  {
    method: 'patch',
    path: '/categories/category-1',
    operation: 'updateCategory',
    body: { name: 'Food' },
  },
  {
    method: 'delete',
    path: '/categories/category-1',
    operation: 'removeCategory',
  },
  {
    method: 'post',
    path: '/categories/category-1/image',
    operation: 'updateCategoryImage',
    upload: true,
  },
  {
    method: 'post',
    path: '/categories/category-1/items',
    operation: 'createItem',
    body: { name: 'Soup', price: 8, currency: 'EUR' },
  },
  {
    method: 'get',
    path: '/categories/category-1/items',
    operation: 'findAllItemsInCategory',
  },
  {
    method: 'put',
    path: '/categories/category-1/items/order',
    operation: 'updateItemOrder',
    body: { orderedIds: ['item-1'] },
  },
  {
    method: 'get',
    path: '/items/item-1/translations',
    operation: 'getForItem',
  },
  {
    method: 'patch',
    path: '/items/item-1/translations',
    operation: 'setOverride',
    body: { field: 'NAME', locale: 'en', value: 'Soup' },
  },
  {
    method: 'patch',
    path: '/items/item-1',
    operation: 'updateItem',
    body: { name: 'Soup' },
  },
  { method: 'delete', path: '/items/item-1', operation: 'removeItem' },
  {
    method: 'post',
    path: '/items/item-1/image',
    operation: 'updateItemImage',
    upload: true,
  },
  {
    method: 'post',
    path: '/items/item-1/options',
    operation: 'createMenuOption',
    body: {
      name: 'Size',
      type: 'VARIATION',
      choices: '[{"name":"Large","priceModifier":2}]',
    },
  },
  {
    method: 'patch',
    path: '/options/option-1',
    operation: 'updateMenuOption',
    body: { name: 'Size' },
  },
  {
    method: 'delete',
    path: '/options/option-1',
    operation: 'removeMenuOption',
  },
  {
    method: 'get',
    path: '/restaurants/r1/menu/bulk-items',
    operation: 'verifyRestaurantOwnership',
  },
  {
    method: 'patch',
    path: '/restaurants/r1/menu/bulk-items',
    operation: 'verifyRestaurantOwnership',
    body: { updates: [{ id: 'item-1', price: 9 }] },
  },
];

/** Actual Nest routes, JWT/access guard ordering, Multer, DTO validation and
 * bulk-edit row scoping. CRUD/storage/authentication I/O is substituted; no
 * AppModule, credentials, network services or live database is involved. */
describe('Menu resource authorization over HTTP', () => {
  let app: INestApplication;
  let actor: { id: string; role: string; restaurantId?: string } | undefined;
  let restaurant: {
    id: string;
    ownerId: string;
    tier: string;
    forceTier: string | null;
    isActive: boolean;
    deletedAt: Date | null;
  };
  const prisma = {
    restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
    menuCategory: { findUnique: jest.fn() },
    menuItem: { findUnique: jest.fn(), findMany: jest.fn() },
    menuOption: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const crud: Record<string, jest.Mock> = Object.fromEntries(
    [
      ...routes
        .map(({ operation }) => operation)
        .filter((name) => !['getForItem', 'setOverride'].includes(name)),
      'verifyCategoryOwnership',
      'verifyItemOwnership',
      'getPublicMenu',
      'getPublicMenuMeta',
      'getCategoryItems',
      'getPublicMenuItems',
      'getTrendingItems',
    ].map((name) => [name, jest.fn()]),
  );
  const overrides = { getForItem: jest.fn(), setOverride: jest.fn() };
  const storage = { uploadWithThumbnail: jest.fn(), delete: jest.fn() };
  const slugs = { resolve: jest.fn() };
  const audit = { auditMenu: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        CategoryController,
        CategoryDetailController,
        ItemController,
        ItemDetailController,
        MenuOptionController,
        MenuOptionDetailController,
        BulkItemController,
        PublicMenuController,
        MenuAuditController,
      ],
      providers: [
        MenuBulkEditService,
        { provide: PrismaService, useValue: prisma },
        { provide: MenuCrudService, useValue: crud },
        { provide: MenuTranslationOverrideService, useValue: overrides },
        { provide: StorageService, useValue: storage },
        { provide: RestaurantSlugService, useValue: slugs },
        { provide: MenuAuditService, useValue: audit },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          if (!actor) throw new UnauthorizedException();
          context.switchToHttp().getRequest<{ user: typeof actor }>().user =
            actor;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    actor = { id: 'owner', role: 'OWNER' };
    restaurant = {
      id: 'r1',
      ownerId: 'owner',
      tier: 'FREE',
      forceTier: null,
      isActive: true,
      deletedAt: null,
    };
    prisma.restaurant.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'r1'
            ? restaurant
            : { ...restaurant, id: where.id, ownerId: 'other-owner' },
        ),
    );
    prisma.menuCategory.findUnique.mockResolvedValue({ restaurantId: 'r1' });
    prisma.menuItem.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({
          category: { restaurantId: where.id === 'item-2' ? 'r2' : 'r1' },
        }),
    );
    prisma.menuOption.findUnique.mockResolvedValue({
      menuItem: { category: { restaurantId: 'r1' } },
    });
    prisma.menuItem.findMany.mockResolvedValue([]);
    crud.verifyCategoryOwnership.mockResolvedValue('r1');
    crud.verifyItemOwnership.mockResolvedValue('r1');
    storage.uploadWithThumbnail.mockResolvedValue({
      url: 'https://images.example/tenants/r1/image.webp',
      thumbnailUrl: 'https://images.example/tenants/r1/image-thumb.webp',
    });
    slugs.resolve.mockResolvedValue({
      restaurantId: 'r1',
      canonicalSlug: 'demo',
    });
    for (const name of [
      'getPublicMenu',
      'getPublicMenuMeta',
      'getCategoryItems',
      'getPublicMenuItems',
      'getTrendingItems',
    ]) {
      crud[name].mockResolvedValue({ public: true });
    }
    audit.auditMenu.mockResolvedValue({ issues: [] });
  });
  function send(route: RouteCase) {
    const req = request(app.getHttpServer())[route.method](route.path);
    if (route.upload)
      return req.attach('file', Buffer.from('fake image'), 'test.png');
    if (route.body) return req.send(route.body);
    return req;
  }
  function expectNoHandler() {
    for (const mock of [
      ...Object.values(crud),
      ...Object.values(overrides),
      ...Object.values(storage),
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
    expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
  }

  describe.each(['owner', 'manager'])('allowed %s', (identity) => {
    it.each(routes)(
      '$method $path reaches only its intended operation',
      async (route) => {
        if (identity === 'manager')
          actor = { id: 'manager', role: 'MANAGER', restaurantId: 'r1' };
        await send(route).expect(route.method === 'post' ? 201 : 200);
        const operation =
          route.operation === 'getForItem'
            ? overrides.getForItem
            : route.operation === 'setOverride'
              ? overrides.setOverride
              : crud[route.operation];
        expect(operation).toHaveBeenCalledTimes(1);
        const args = operation.mock.calls[0] as unknown[];
        expect(args.at(-1)).toBe(identity);
        if (route.upload) {
          expect(storage.uploadWithThumbnail).toHaveBeenCalledWith(
            expect.any(Buffer),
            'test.png',
            'image/png',
            'r1',
          );
        }
      },
    );
  });

  it.each(routes)(
    'no JWT: $method $path rejects before resource lookup',
    async (route) => {
      actor = undefined;
      await send(route).expect(401);
      for (const model of Object.values(prisma))
        expect(model.findUnique).not.toHaveBeenCalled();
      expectNoHandler();
    },
  );
  it.each(routes)(
    'foreign tenant: $method $path rejects before handler',
    async (route) => {
      actor = { id: 'other-owner', role: 'OWNER', restaurantId: 'r2' };
      await send(route).expect(403);
      expectNoHandler();
    },
  );
  it.each(['STAFF', 'WAITER', 'KITCHEN', 'CUSTOMER', 'SUPER_ADMIN'])(
    'assigned %s cannot edit or restore raw MANAGER privileges',
    async (role) => {
      actor = { id: 'manager', role, restaurantId: 'r1' };
      prisma.user.findUnique.mockResolvedValue({ ...actor, role: 'MANAGER' });
      await request(app.getHttpServer())
        .patch('/items/item-1?restaurantId=r1')
        .send({ name: 'Soup', role: 'MANAGER', restaurantId: 'r1' })
        .expect(403);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expectNoHandler();
    },
  );
  it('does not authorize the owning tenant from a forged body/query when the item belongs elsewhere', async () => {
    await request(app.getHttpServer())
      .patch('/items/item-2?restaurantId=r1')
      .send({ name: 'Soup', restaurantId: 'r1' })
      .expect(403);
    expect(prisma.restaurant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r2' } }),
    );
    expectNoHandler();
  });
  it.each([
    ['/categories/missing', 'menuCategory'],
    ['/items/missing', 'menuItem'],
    ['/options/missing', 'menuOption'],
  ] as const)('missing resource %s remains 404', async (path, model) => {
    prisma[model].findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .patch(path)
      .send({ name: 'Soup' })
      .expect(404);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    expectNoHandler();
  });
  it.each(['suspended', 'deleted'])(
    '%s menu remains blocked with its localization code',
    async (state) => {
      if (state === 'suspended') restaurant.isActive = false;
      else restaurant.deletedAt = new Date();
      const res = await request(app.getHttpServer())
        .patch('/items/item-1')
        .send({ name: 'Soup' })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'RESTAURANT_SUSPENDED' });
      expectNoHandler();
    },
  );
  it('database failure is not permission to enter the handler', async () => {
    prisma.menuOption.findUnique.mockRejectedValue(
      new Error('database unavailable'),
    );
    await request(app.getHttpServer()).delete('/options/option-1').expect(500);
    expectNoHandler();
  });

  it.each([
    ['/categories/category-1/image', CategoryDetailController],
    ['/items/item-1/image', ItemDetailController],
  ] as const)(
    'rejects %s before even invoking the Multer interceptor',
    async (path, controller) => {
      const interceptors = Reflect.getMetadata(
        INTERCEPTORS_METADATA,
        controller.prototype.uploadImage,
      ) as Type<NestInterceptor>[];
      const intercept = jest.spyOn(interceptors[0].prototype, 'intercept');
      try {
        actor = { id: 'other-owner', role: 'OWNER' };
        await request(app.getHttpServer())
          .post(path)
          .attach('file', Buffer.from('fake image'), 'test.png')
          .expect(403);
        expect(intercept).not.toHaveBeenCalled();
        expectNoHandler();

        actor = { id: 'owner', role: 'OWNER' };
        await request(app.getHttpServer())
          .post(path)
          .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')
          .expect(413);
        expect(intercept).toHaveBeenCalledTimes(1);
        expectNoHandler();
      } finally {
        intercept.mockRestore();
      }
    },
  );

  it.each([
    ['/categories/category-1/image', 'verifyCategoryOwnership'],
    ['/items/item-1/image', 'verifyItemOwnership'],
  ])(
    'retains the second ownership check before storage: %s',
    async (path, operation) => {
      crud[operation].mockRejectedValue(
        new ForbiddenException('Ownership changed'),
      );
      await request(app.getHttpServer())
        .post(path)
        .attach('file', Buffer.from('fake image'), 'test.png')
        .expect(403);
      expect(storage.uploadWithThumbnail).not.toHaveBeenCalled();
    },
  );
  it("bulk editing rejects another restaurant's item even when the actor owns both", async () => {
    // Guard permits this owner and the real bulk-edit service verifies each row.
    prisma.restaurant.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ ...restaurant, id: where.id }),
    );
    const res = await request(app.getHttpServer())
      .patch('/restaurants/r1/menu/bulk-items')
      .send({
        updates: [
          { id: 'item-1', price: 9 },
          { id: 'item-2', price: 10 },
        ],
      })
      .expect(200);
    expect(res.body).toEqual({
      updated: ['item-1'],
      failed: [
        { id: 'item-2', error: 'Item does not belong to this restaurant' },
      ],
    });
    expect(crud.updateItem).toHaveBeenCalledTimes(1);
    expect(crud.updateItem).toHaveBeenCalledWith(
      'item-1',
      { price: 9 },
      'owner',
    );
  });

  it.each([
    '/menu/public/resolve/demo',
    '/menu/public/r1',
    '/menu/public/r1/meta',
    '/menu/public/r1/categories/category-1/items',
    '/menu/public/r1/items',
    '/menu/public/r1/trending',
  ])('public QR/menu route remains anonymous: %s', async (path) => {
    actor = undefined;
    await request(app.getHttpServer()).get(path).expect(200);
    for (const model of Object.values(prisma))
      expect(model.findUnique).not.toHaveBeenCalled();
  });
  it('the menu index still requires JWT without pretending to have a tenant id', async () => {
    actor = undefined;
    await request(app.getHttpServer()).get('/menu').expect(401);
    actor = { id: 'owner', role: 'OWNER' };
    await request(app.getHttpServer()).get('/menu').expect(200);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
  });
  it("preserves the audit report's broader assigned-staff policy", async () => {
    actor = { id: 'staff', role: 'STAFF', restaurantId: 'r1' };
    await request(app.getHttpServer()).get('/menu/audit/r1').expect(200);
    expect(audit.auditMenu).toHaveBeenCalledWith('r1', 'staff');
  });
});
