import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { assertSafePrismaCommand } from './scripts/prisma-cli-safety';

assertSafePrismaCommand(process.argv, process.env.DATABASE_URL);

export default defineConfig({
  schema: 'prisma/schema.prisma',
});
