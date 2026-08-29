import {
  type INestApplication,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Keep runtime routing and the published OpenAPI contract on one seam. */
export function configureApiRouting(app: INestApplication): void {
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
}

export function createApiDocument(app: INestApplication) {
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

  return SwaggerModule.createDocument(app, config);
}
