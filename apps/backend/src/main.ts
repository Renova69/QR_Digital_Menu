import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    app.enableCors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      credentials: true,
    });

    app.setGlobalPrefix('api', {
      exclude: [{ path: '/', method: RequestMethod.GET }],
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

    await app.listen(3000, '0.0.0.0');
    console.log('✅ Application is running');
  } catch (error) {
    console.error('❌ Application failed to start:', error);
    process.exit(1);
  }
}
bootstrap();
