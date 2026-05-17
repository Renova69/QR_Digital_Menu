import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('SuperAdmin (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/super-admin/stats (GET) without auth -> 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/super-admin/stats')
      .expect(401);
  });

  it('/api/v1/super-admin/tenants (GET) without auth -> 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/super-admin/tenants')
      .expect(401);
  });
});
