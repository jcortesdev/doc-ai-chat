import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// pg v8 warns that sslmode=require/prefer/verify-ca are treated as verify-full and
// will change meaning in pg v9. We already rely on the verify-full behavior, so
// pin it explicitly: this silences the deprecation warning (which Next surfaces in
// the dev error overlay) and locks the current behavior across the v9 bump.
function pinSslMode(url: string): string {
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)\b/i, '$1verify-full');
}

const pool = new Pool({ connectionString: pinSslMode(connectionString) });

export const db = drizzle(pool, { schema });
