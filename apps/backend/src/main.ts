import { NestFactory } from '@nestjs/core';
import {
  Logger,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { RedisIoAdapter } from './adapters/redis-io.adapter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import helmet from 'helmet';
import * as crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { authenticatedNoStore } from './common/authenticated-no-store.middleware';
import { AppLogger } from './common/logging/app-logger';
import { requestLogger } from './common/logging/request-logger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { isCsrfExemptPath } from './common/security/csrf-exempt';
import { validatePaymentSecretCryptoConfig } from './payment/secret-crypto';
import { validateRuntimeEnvironment } from './auth/auth-runtime-policy';

function validateFrontendUrl(logger: Logger) {
  const rawFrontendUrl = process.env.FRONTEND_URL?.trim();
  const frontendUrl = rawFrontendUrl || 'http://localhost:3001';

  let parsed: URL;
  try {
    parsed = new URL(frontendUrl);
  } catch {
    throw new Error(
      `FRONTEND_URL must be a valid http(s) URL. Received: ${frontendUrl}`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `FRONTEND_URL must use http or https. Received protocol: ${parsed.protocol}`,
    );
  }

  if (process.env.NODE_ENV === 'production' && !rawFrontendUrl) {
    logger.warn(
      'FRONTEND_URL is not set in production; device enrollment links will fall back to http://localhost:3001.',
    );
  }

  process.env.FRONTEND_URL = frontendUrl.replace(/\/+$/, '');
}

async function bootstrap() {
  // Raw console.log, zero dependencies, emitted before anything else runs —
  // a boot-visibility watchdog. If this line never appears in a future dev
  // session, the process stalled at module load (e.g. slow disk require())
  // before bootstrap() ran at all; if it appears but nothing after it does,
  // the stall is inside the try block below (env validation, Prisma/Redis
  // connect, or Nest module init). Without this, a boot stall is
  // indistinguishable from a boot crash until the frontend's 180s timeout.
  console.log(
    `[boot] ${new Date().toISOString()} bootstrap() invoked — process alive, starting init`,
  );
  const appLogger = new AppLogger();
  const logger = new Logger('Bootstrap');
  try {
    validateRuntimeEnvironment();
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

    const paymentSecretConfig = validatePaymentSecretCryptoConfig();
    for (const warning of paymentSecretConfig.warnings) {
      logger.warn(warning);
    }

    validateFrontendUrl(logger);

    const app = await NestFactory.create(AppModule, {
      bodyParser: false,
      logger: appLogger,
    });
    app.useLogger(appLogger);

    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    app.use((req: any, _res: any, next: any) => {
      req['requestId'] = crypto.randomUUID();
      next();
    });
    app.use(requestLogger);

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
      exposedHeaders: ['X-Request-Id'],
    });

    app.use(cookieParser());
    app.use(authenticatedNoStore);

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
            // This CSP is attached to backend-served documents (for example
            // Swagger). Scheme-wide ws:/wss: would let any injected document
            // exfiltrate to an arbitrary WebSocket host. Same-origin is the
            // only backend-document connection source required.
            connectSrc: ["'self'"],
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
    // L-AUTH-1: exemptions + per-entry rationale live in one pinned, tested
    // module (common/security/csrf-exempt.ts) so a future addition can't
    // silently drop CSRF protection without failing csrf-exempt.spec.ts.
    // #4: bypass CSRF only for explicit local dev/test. Previously ANY
    // NODE_ENV !== 'production' (staging, preview, or unset on a deployed box)
    // disabled CSRF entirely; those environments now enforce the double-submit
    // check. The frontend always sends the token, so local dev still works.
    const csrfBypassEnv =
      process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    app.use((req: any, res: any, next: any) => {
      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      const isWebhook =
        req.path === '/api/v1/payments/webhook' ||
        req.path === '/api/v1/payments/epay/notify' ||
        req.path === '/api/v1/payments/mypos/notify' ||
        req.path === '/api/v1/payments/borica/callback' ||
        req.path === '/api/v1/subscription/webhook';
      // H3: POST /orders uses OptionalJwtAuthGuard, so when the caller presents
      // an auth cookie the request IS cookie-authenticated (POS staff, or a
      // logged-in customer redeeming loyalty points) and must NOT skip CSRF —
      // otherwise a forged cross-site POST rides the victim's ambient cookie
      // (sameSite=none in prod) to drain points / forge staff orders. Truly
      // anonymous QR orders carry no token cookie and stay exempt.
      const carriesAuthCookie = Boolean(req.cookies?.token);
      const isCsrfExempt =
        isCsrfExemptPath(req.path, req.method) &&
        !(req.path === '/api/v1/orders' && carriesAuthCookie);

      if (
        safeMethods.includes(req.method) ||
        isWebhook ||
        isCsrfExempt ||
        csrfBypassEnv
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
    // Browsers use these non-standard JSON media types for legacy report-uri
    // and the Reporting API. Parse only this bounded endpoint before the
    // generic application/json parser.
    app.use(
      '/api/v1/client-logs/csp',
      express.json({
        type: [
          'application/csp-report',
          'application/reports+json',
          'application/json',
        ],
        limit: '64kb',
      }),
    );
    // Menu import/export payloads (full menu + translations) can be large.
    // NOTE: this was already 1mb, so a 109KB import never hit it — the import
    // 500 in BUGS.md has a different root cause (needs the backend stack trace).
    app.use((req: any, res: any, next: any) => {
      if (req.path.includes('/menu/import')) {
        express.json({ limit: '10mb' })(req, res, next);
      } else {
        next();
      }
    });
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    app.setGlobalPrefix('api', {
      exclude: [
        { path: '/', method: RequestMethod.GET },
        // Short reservation manage-link redirect: `{BACKEND_URL}/r/:token`.
        // Excluded from the /api prefix (and version-neutral in its controller)
        // so the SMS link stays short.
        { path: 'r/:token', method: RequestMethod.GET },
      ],
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

    // Establish the Prisma connection pool before accepting traffic so the
    // first requests after boot don't race an un-connected client (BUGS.md S2).
    await app.get(PrismaService).$connect();

    const port = parseInt(process.env.PORT || '3000', 10);
    await app.listen(port, '0.0.0.0');
    logger.log(`✅ Application is running on port ${port}`);
  } catch (error) {
    logger.error('❌ Application failed to start:', error);
    process.exit(1);
  }
}
void bootstrap();
