import { defineConfig, env } from 'prisma/config';

// Prisma 7 doesn't auto-load .env in the config context; load it ourselves so
// env('DIRECT_URL') resolves. Node 20.12+/21.7+ ships process.loadEnvFile.
try {
  process.loadEnvFile?.('.env');
} catch {
  // .env is optional (e.g. vars already exported in the environment / CI).
}

// Prisma 7 moved connection URLs out of schema.prisma into this file.
// Supabase: DATABASE_URL is the pooled (pgBouncer, :6543) connection used at
// runtime; DIRECT_URL is the direct (:5432) connection Prisma needs for
// migrations. Both are provided via .env — see .env.example.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Direct (session-mode) connection for migrations. No shadowDatabaseUrl:
    // `migrate deploy` doesn't need one, and Supabase's pooler can't host it.
    url: env('DIRECT_URL'),
  },
});
