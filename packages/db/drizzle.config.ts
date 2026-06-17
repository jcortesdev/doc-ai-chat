import { defineConfig } from 'drizzle-kit';

// Migrations (DDL) run as the Neon owner — the least-privilege docai_app runtime
// role intentionally lacks CREATE. Use MIGRATE_DATABASE_URL when set, else fall
// back to DATABASE_URL.
const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('Neither MIGRATE_DATABASE_URL nor DATABASE_URL is set');
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  // Only manage the docai schema; never touch public or Clerk-owned tables.
  schemaFilter: ['docai'],
  // Keep Drizzle's bookkeeping table inside docai — the docai_app role only has
  // CREATE on this schema, not on the database (so it cannot make a new schema).
  migrations: {
    schema: 'docai',
    table: '__drizzle_migrations',
  },
  dbCredentials: { url },
});
