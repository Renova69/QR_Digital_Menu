import { Test, TestingModule } from '@nestjs/testing';
import { MenuAuditController } from './audit.controller';
import { MenuAuditService } from './menu-audit.service';

describe('MenuAuditController', () => {
  let controller: MenuAuditController;
  let service: MenuAuditService;

  const mockAudit = {
    auditMenu: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenuAuditController],
      providers: [{ provide: MenuAuditService, useValue: mockAudit }],
    }).compile();

    controller = module.get<MenuAuditController>(MenuAuditController);
    service = module.get<MenuAuditService>(MenuAuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('auditMenu', () => {
    it('should call audit.auditMenu with restaurantId and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockAudit.auditMenu.mockResolvedValue({ issues: [] });

      const result = await controller.auditMenu('rest-1', req);

      expect(mockAudit.auditMenu).toHaveBeenCalledWith('rest-1', 'user-1');
      expect(result).toEqual({ issues: [] });
    });
  });
});
