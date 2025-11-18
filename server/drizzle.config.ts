import type { Config } from 'drizzle-kit';

export default {
  schema: './database/schema.ts',
  out: './database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: '../data/database.sqlite',
  },
  verbose: true,
  strict: true,
} satisfies Config;
