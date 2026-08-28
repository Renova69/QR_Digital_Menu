import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { OptionalJwtStrategy } from '../src/auth/optional-jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

const databaseUrl = process.env.CONCURRENCY_DATABASE_URL;
const withDatabase = databaseUrl ? describe : describe.skip;

withDatabase('Durable auth sessions (isolated PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let user: User;
  const prefix = `session-test-${randomUUID()}`;

  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      !target.pathname.endsWith('_test') ||
      process.env.DATABASE_URL !== databaseUrl
    ) {
      throw new Error(
        'Session tests require matching, explicitly named local *_test database URLs.',
      );
    }
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
  });

  beforeEach(async () => {
    user = await prisma.user.create({
      data: {
        email: `${prefix}-${randomUUID()}@example.test`,
        password: await bcrypt.hash('test-secret', 4),
        role: 'OWNER',
      },
    });
  });

  afterAll(async () => {
    // No resets or broad cleanup: remove only the fixtures this test created.
    if (prisma)
      await prisma.user.deleteMany({
        where: { email: { startsWith: prefix } },
      });
    if (app) await app.close();
  });

  const cookie = (token: string) => `token=${token}`;

  it('issues a durable session through password login and excludes credentials from inventory', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'test-secret' })
      .expect(201);
    const inventory = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Cookie', cookie(login.body.token))
      .expect(200);
    expect(inventory.headers['cache-control']).toBe('no-store');
    expect(inventory.body.sessions).toHaveLength(1);
    expect(inventory.body.sessions[0]).toMatchObject({
      current: true,
      authMethod: 'PASSWORD',
    });
    expect(Object.keys(inventory.body.sessions[0]).sort()).toEqual(
      [
        'id',
        'authMethod',
        'deviceTokenId',
        'ipAddress',
        'userAgent',
        'createdAt',
        'expiresAt',
        'current',
      ].sort(),
    );
  });

  it('revokes one session without revoking another login for the same user', async () => {
    const first = await auth.login(user);
    const second = await auth.login(user);
    const inventory = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Cookie', cookie(first.token))
      .expect(200);
    const other = inventory.body.sessions.find(
      (session: { current: boolean }) => !session.current,
    );
    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${other.id}`)
      .set('Cookie', cookie(first.token))
      .expect(200, { success: true, current: false });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie(first.token))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie(second.token))
      .expect(401);
    const claims = app.get(JwtService).verify(second.token);
    await expect(app.get(OptionalJwtStrategy).validate(claims)).rejects.toThrow(
      'SESSION_REVOKED',
    );
  });

  it('refuses a cross-user session id without changing the foreign row', async () => {
    const foreign = await prisma.user.create({
      data: {
        email: `${prefix}-${randomUUID()}@example.test`,
        password: 'not-used',
        role: 'OWNER',
      },
    });
    await auth.login(foreign);
    const foreignSession = await prisma.userSession.findFirstOrThrow({
      where: { userId: foreign.id },
    });
    const own = await auth.login(user);
    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${foreignSession.id}`)
      .set('Cookie', cookie(own.token))
      .expect(404);
    expect(
      (
        await prisma.userSession.findUniqueOrThrow({
          where: { id: foreignSession.id },
        })
      ).revokedAt,
    ).toBeNull();
  });

  it('rejects old sessions and a login racing with global signout, but permits a fresh login', async () => {
    const first = await auth.login(user);
    const second = await auth.login(user);
    await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions')
      .set('Cookie', cookie(first.token))
      .expect(200);
    // Model credentials checked before the global version increment, with
    // session insertion completing afterwards. That stale login must fail.
    const racing = await auth.login(user);
    for (const token of [first.token, second.token, racing.token]) {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', cookie(token))
        .expect(401);
    }
    const freshUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(freshUser.sessionVersion).toBe(1);
    const fresh = await auth.login(freshUser);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie(fresh.token))
      .expect(200);
  });

  it('makes a copied cookie unusable after ordinary logout', async () => {
    const login = await auth.login(user);
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie(login.token))
      .expect(201);
    expect(String(result.headers['set-cookie'])).toContain('token=;');
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookie(login.token))
      .expect(401);
  });

  it('paginates all active sessions without duplicates or cross-user records', async () => {
    const login = await auth.login(user);
    await prisma.userSession.createMany({
      data: Array.from({ length: 51 }, () => ({
        id: randomUUID(),
        userId: user.id,
        sessionVersion: 0,
        authMethod: 'PASSWORD',
        expiresAt: new Date(Date.now() + 60_000),
      })),
    });
    const first = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Cookie', cookie(login.token))
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .query({ cursor: first.body.nextCursor })
      .set('Cookie', cookie(login.token))
      .expect(200);
    expect(first.body.sessions).toHaveLength(50);
    expect(second.body.sessions).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    const ids = [...first.body.sessions, ...second.body.sessions].map(
      (session: { id: string }) => session.id,
    );
    expect(new Set(ids).size).toBe(52);
    expect(
      await prisma.userSession.count({
        where: { id: { in: ids }, userId: user.id },
      }),
    ).toBe(52);
  });

  it('requires authentication and validates the pagination cursor', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/sessions').expect(401);
    await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions')
      .expect(401);
    const login = await auth.login(user);
    await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .query({ cursor: 'not-a-uuid' })
      .set('Cookie', cookie(login.token))
      .expect(400);
  });
});
