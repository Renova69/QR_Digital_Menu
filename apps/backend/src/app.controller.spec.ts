import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getApiInfo', () => {
    it('should return API information object', () => {
      const result = appController.getApiInfo();
      expect(result).toHaveProperty('message', 'QR Menu API');
      expect(result).toHaveProperty('version', '1.0.0');
      expect(result).toHaveProperty('documentation', '/api-docs');
      expect(result).toHaveProperty('endpoints');
      expect(result.endpoints).toHaveProperty('authentication', '/api/auth');
      expect(result.endpoints).toHaveProperty('menu', '/api/menu');
      expect(result.endpoints).toHaveProperty(
        'restaurants',
        '/api/restaurants',
      );
    });
  });
});
