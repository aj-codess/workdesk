// Prisma CLI configuration (Prisma 6.19.x).
// When this file exists the CLI no longer loads .env on its own, hence the dotenv import.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
});
