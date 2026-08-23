import { AssistanceController } from './assistance.controller';

describe('AssistanceController', () => {
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let controller: AssistanceController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new AssistanceController(service as any);
  });

  it('creates an assistance request from the validated body', () => {
    const dto = { tableId: 't-1', type: 'URGENT' } as any;
    service.create.mockResolvedValue({ id: 'a1' });

    const result = controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).resolves.toEqual({ id: 'a1' });
  });

  it('lists requests for the authenticated owner', () => {
    const query = { page: 1 } as any;
    service.findAll.mockResolvedValue([]);

    const result = controller.findAll({ user: { id: 'u1' } }, query);

    expect(service.findAll).toHaveBeenCalledWith('u1', query);
    expect(result).resolves.toEqual([]);
  });

  it('finds one request scoped to the owner', () => {
    service.findOne.mockResolvedValue({ id: 'a1' });

    const result = controller.findOne('a1', { user: { id: 'u1' } });

    expect(service.findOne).toHaveBeenCalledWith('a1', 'u1');
    expect(result).resolves.toEqual({ id: 'a1' });
  });

  it('updates a request with the owner id attached', () => {
    const dto = { isResolved: true } as any;
    service.update.mockResolvedValue({ id: 'a1', isResolved: true });

    const result = controller.update('a1', dto, { user: { id: 'u1' } });

    expect(service.update).toHaveBeenCalledWith('a1', dto, 'u1');
    expect(result).resolves.toEqual({ id: 'a1', isResolved: true });
  });

  it('removes a request scoped to the owner', () => {
    service.remove.mockResolvedValue({ id: 'a1' });

    const result = controller.remove('a1', { user: { id: 'u1' } });

    expect(service.remove).toHaveBeenCalledWith('a1', 'u1');
    expect(result).resolves.toEqual({ id: 'a1' });
  });
});
