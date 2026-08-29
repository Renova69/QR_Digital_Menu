import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import {
  configureApiRouting,
  createApiDocument,
} from '../src/common/api-documentation';

async function main(): Promise<void> {
  // Module construction is enough for Swagger metadata. The application is
  // never initialised or listened, so lifecycle hooks cannot connect to a DB,
  // Redis, R2, Stripe, or any other external dependency.
  process.env.NODE_ENV = 'test';
  // Prisma validates the datasource URL in its constructor even though this
  // documentation-only application never calls `$connect`.
  process.env.DATABASE_URL ??= 'postgresql://openapi@127.0.0.1:1/openapi';
  process.env.DIRECT_URL ??= process.env.DATABASE_URL;
  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
    abortOnError: false,
  });
  try {
    configureApiRouting(app);
    const document = createApiDocument(app);
    const output = resolve(__dirname, '../../docs/static/api/openapi.json');
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    console.log(`OpenAPI artifact generated: ${output}`);
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
