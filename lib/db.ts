import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 connects through a driver adapter rather than a schema `url`. We use
// the pooled Supabase connection (DATABASE_URL, pgBouncer :6543) at runtime.
// A single client is reused across hot-reloads in dev to avoid exhausting
// connections (Next.js re-imports modules on every change).
//
// The client is constructed lazily (on first actual use of `prisma`, via the
// Proxy below), not at module load. Several pages guard their own DB access
// with `if (process.env.DATABASE_URL)` at runtime so they can render on
// non-DB data alone when the database isn't configured. If we constructed
// the client eagerly at import time, `import { prisma } from '@/lib/db'`
// would throw before that runtime guard ever ran, crashing pages that never
// intended to touch the database in that environment. Deferring construction
// until a property is actually accessed on `prisma` preserves those guards
// while keeping the exact same singleton/HMR behavior as before.

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Add it to .env (see .env.example).');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let cached: PrismaClient | undefined = globalForPrisma.prisma;

function getPrisma(): PrismaClient {
  if (!cached) {
    cached = createPrismaClient();
    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = cached;
    }
  }
  return cached;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get: (_target, prop) => {
    const client = getPrisma();
    const value = Reflect.get(client as object, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
  has: (_target, prop) => Reflect.has(getPrisma() as object, prop),
});
