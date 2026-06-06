import { NestFactory } from '@nestjs/core';
import {
  Logger,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './adapters/redis-io.adapter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import helmet from 'helmet';
import * as crypto from 'crypto';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  try {
    const requiresProductionNodeEnv =
      process.env.REQUIRE_PRODUCTION_NODE_ENV === 'true' ||
      !!process.env.K_SERVICE ||
      !!process.env.CLOUD_RUN_JOB;
    if (requiresProductionNodeEnv && process.env.NODE_ENV !== 'production') {
      throw new Error(
        'NODE_ENV must be set to production in this deployment. Refusing to start with relaxed development security.',
      );
    }

    // Subscription webhook is verified with its own signing secret. Without it,
    // signature verification fails closed and Stripe subscription events are
    // dropped. Fail loud at boot in production (mirrors the payments-webhook
    // guard in StripeProvider). STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET are
    // already guarded there.
    if (
      process.env.NODE_ENV === 'production' &&
      (!process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET ||
        process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET === 'NONE')
    ) {
      throw new Error(
        'STRIPE_SUBSCRIPTION_WEBHOOK_SECRET must be set in production. Refusing to start with unverifiable subscription webhooks.',
      );
    }

    // Without a Stripe secret key, every Stripe API call (checkout, portal,
    // subscription lookups) fails. Fail loud at boot in production rather than
    // limping along with a placeholder key (M-8).
    if (
      process.env.NODE_ENV === 'production' &&
      !process.env.STRIPE_SECRET_KEY
    ) {
      throw new Error('[Startup] STRIPE_SECRET_KEY must be set in production');
    }

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
        const isProduction = process.env.NODE_ENV === 'production';
        // Localhost origins are only trusted outside production (#M6). With
        // credentials:true, trusting localhost in prod weakens the single-origin
        // policy and aids local-driven credentialed requests.
        const allowed = new Set([
          process.env.FRONTEND_URL || 'http://localhost:3001',
          ...(isProduction
            ? []
            : [
                'http://localhost:3001',
                'http://127.0.0.1:3001',
                'http://localhost:3002',
                'http://127.0.0.1:3002',
              ]),
        ]);
        // In production restrict CORS headers to explicit origins only; no
        // wildcard *.vercel.app. Returning false for unknown origins keeps
        // browser XHR blocked by CORS without failing normal form POST callbacks
        // from payment providers before webhook/callback handlers can run.
        if (!origin || allowed.has(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
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
            styleSrc: [
              "'self'",
              "'unsafe-inline'",
              'https://fonts.googleapis.com',
            ],
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
      '/api/v1/orders',
    ];
    app.use((req: any, res: any, next: any) => {
      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      const isWebhook =
        req.path === '/api/v1/payments/webhook' ||
        req.path === '/api/v1/payments/epay/notify' ||
        req.path === '/api/v1/payments/borica/callback' ||
        req.path === '/api/v1/subscription/webhook';
      const isCsrfExempt =
        CSRF_EXEMPT.includes(req.path) && ['POST'].includes(req.method);

      if (
        safeMethods.includes(req.method) ||
        isWebhook ||
        isCsrfExempt ||
        process.env.NODE_ENV !== 'production'
      ) {
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

    app.use(
      '/api/v1/payments/webhook',
      express.raw({ type: 'application/json', limit: '5mb' }),
    );
    app.use(
      '/api/v1/subscription/webhook',
      express.raw({ type: 'application/json', limit: '5mb' }),
    );
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
    logger.log(`✅ Application is running on port ${port}`);
  } catch (error) {
    logger.error('❌ Application failed to start:', error);
    process.exit(1);
  }
}
bootstrap();
