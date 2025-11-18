import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/schema.ts',
  out: './src/database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/database.sqlite',
  },
  verbose: true,
  strict: true,
} satisfies Config;
