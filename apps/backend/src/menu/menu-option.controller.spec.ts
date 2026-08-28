import { RestaurantAccessGuard } from '../auth/restaurant-access.guard';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MenuOptionController,
  MenuOptionDetailController,
} from './menu-option.controller';
import { MenuCrudService } from './menu-crud.service';

describe('MenuOptionController', () => {
  let c: MenuOptionController;
  const mockCrud = { createMenuOption: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [MenuOptionController],
      providers: [{ provide: MenuCrudService, useValue: mockCrud }],
    })
      // Direct-call dispatch tests; the real guard runs in menu-access.http.spec.ts.
      .overrideGuard(RestaurantAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    c = m.get<MenuOptionController>(MenuOptionController);
  });
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(c).toBeDefined());
  it('create delegates to crud.createMenuOption', async () => {
    const req = { user: { id: 'u1' } };
    const dto = { name: 'Size' } as any;
    mockCrud.createMenuOption.mockResolvedValue({ id: 'o1' });
    const r = await c.create('i1', dto, req);
    expect(mockCrud.createMenuOption).toHaveBeenCalledWith('i1', dto, 'u1');
    expect(r).toEqual({ id: 'o1' });
  });
});

describe('MenuOptionDetailController', () => {
  let c: MenuOptionDetailController;
  const mockCrud = { updateMenuOption: jest.fn(), removeMenuOption: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [MenuOptionDetailController],
      providers: [{ provide: MenuCrudService, useValue: mockCrud }],
    })
      // Direct-call dispatch tests; the real guard runs in menu-access.http.spec.ts.
      .overrideGuard(RestaurantAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    c = m.get<MenuOptionDetailController>(MenuOptionDetailController);
  });
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(c).toBeDefined());
  it('update delegates to crud.updateMenuOption', async () => {
    const req = { user: { id: 'u1' } };
    const dto = { name: 'Updated' } as any;
    mockCrud.updateMenuOption.mockResolvedValue({ id: 'o1' });
    const r = await c.update('o1', dto, req);
    expect(mockCrud.updateMenuOption).toHaveBeenCalledWith('o1', dto, 'u1');
    expect(r).toEqual({ id: 'o1' });
  });
  it('remove delegates to crud.removeMenuOption', async () => {
    const req = { user: { id: 'u1' } };
    mockCrud.removeMenuOption.mockResolvedValue({ deleted: true });
    const r = await c.remove('o1', req);
    expect(mockCrud.removeMenuOption).toHaveBeenCalledWith('o1', 'u1');
    expect(r).toEqual({ deleted: true });
  });
});
