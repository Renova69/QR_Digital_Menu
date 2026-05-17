import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './adapters/redis-io.adapter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import helmet from 'helmet';
import * as crypto from 'crypto';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, { bodyParser: false });

    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );

    app.use((req: any, _res: any, next: any) => {
      req['requestId'] = crypto.randomUUID();
      next();
    });

    // CORS must run first so ALL responses (including CSRF 403s) include CORS headers
    app.enableCors({
      origin: (origin: any, callback: any) => {
        const allowed = [
          process.env.FRONTEND_URL || 'http://localhost:3001',
          'http://localhost:3001',
          'http://127.0.0.1:3001',
          'http://localhost:3002',
          'http://127.0.0.1:3002',
        ];
        // Allow Vercel preview + production domains
        if (
          !origin ||
          allowed.includes(origin) ||
          (typeof origin === 'string' && origin.endsWith('.vercel.app'))
        ) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: ${origin} not allowed`));
        }
      },
      credentials: true,
    });

    app.use(cookieParser());

    // Helmet — security headers before CSRF so 403 responses get them
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
            frameSrc: ["'self'", 'https://js.stripe.com'],
          },
        },
        crossOriginEmbedderPolicy: false,
      }),
    );

    // CSRF — double-submit cookie pattern
    // Cross-origin deployments (Vercel → Cloud Run) need SameSite=None so cookies are
    // sent on cross-site fetch/XHR. Secure=true is set for production, which is required
    // by browsers when SameSite=None.
    const COOKIE_SAMESITE: 'lax' | 'strict' | 'none' =
      (process.env.COOKIE_SAMESITE as any) ||
      (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
    const CSRF_EXEMPT = [
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/auth/otp/send',
      '/api/v1/auth/otp/verify',
      '/api/v1/auth/google',
      '/api/v1/auth/google/callback',
    ];
    app.use((req: any, res: any, next: any) => {
      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      const isWebhook =
        req.path === '/api/v1/payments/webhook' ||
        req.path === '/api/v1/subscription/webhook';
      const isCsrfExempt = CSRF_EXEMPT.includes(req.path) && ['POST'].includes(req.method);

      if (safeMethods.includes(req.method) || isWebhook || isCsrfExempt || process.env.NODE_ENV !== 'production') {
        if (!req.cookies?.['csrf-token']) {
          const csrfToken = crypto.randomUUID();
          res.cookie('csrf-token', csrfToken, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: COOKIE_SAMESITE,
            path: '/',
          });
          req['csrfToken'] = csrfToken;
        } else {
          req['csrfToken'] = req.cookies['csrf-token'];
        }
        return next();
      }

      const cookieToken = req.cookies?.['csrf-token'];
      const headerToken = req.headers['x-csrf-token'];

      if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return res.status(403).json({ message: 'Invalid CSRF token' });
      }

      next();
    });

    app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json', limit: '5mb' }));
    app.use('/api/v1/subscription/webhook', express.raw({ type: 'application/json', limit: '5mb' }));
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    app.setGlobalPrefix('api', {
      exclude: [{ path: '/', method: RequestMethod.GET }],
    });

    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    const config = new DocumentBuilder()
      .setTitle('QR Menu API')
      .setDescription('API for QR-based restaurant menu system')
      .setVersion('1.0')
      .addTag('authentication', 'Endpoints for user authentication')
      .addTag('menu', 'Endpoints for menu management')
      .addTag('restaurants', 'Endpoints for restaurant management')
      .addTag('dashboard', 'Endpoints for dashboard statistics')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);

    const redisAdapter = new RedisIoAdapter(app);
    await redisAdapter.connectToRedis();
    app.useWebSocketAdapter(redisAdapter);

    const port = parseInt(process.env.PORT || '3000', 10);
    await app.listen(port, '0.0.0.0');
    console.log(`✅ Application is running on port ${port}`);
  } catch (error) {
    console.error('❌ Application failed to start:', error);
    process.exit(1);
  }
}
bootstrap();
