import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so the test exercises the real route mapping: the root
    // GET is excluded from the 'api' prefix (302 redirect), everything else is
    // served under /api/v1/*. Without this the spec hit the redirect at /api.
    app.setGlobalPrefix('api', {
      exclude: [{ path: '/', method: RequestMethod.GET }],
    });
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/api returns API information', () => {
    return request(app.getHttpServer())
      .get('/api/v1/api')
      .expect(200)
      .expect((res: any) => {
        expect(res.body.message).toBe('QR Menu API');
        expect(res.body.version).toBe('1.0.0');
      });
  });
});
