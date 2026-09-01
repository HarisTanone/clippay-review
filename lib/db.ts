import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://clippay:clippay@localhost:5433/clippay";

// Global pool singleton untuk mencegah multiple pool di Next.js hot-reloading
declare global {
  // eslint-disable-next-line no-var
  var __clippay_pg_pool__: Pool | undefined;
}

const pool =
  global.__clippay_pg_pool__ ||
  new Pool({
    connectionString,
    max: 20, // Max concurrent connections di pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__clippay_pg_pool__ = pool;
}

export { pool };

/**
 * Eksekusi query langsung ke pool
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Eksekusi sekumpulan operasi dalam transaksi atomik PostgreSQL
 * Otomatis menangani BEGIN, COMMIT, ROLLBACK saat error, dan release koneksi.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      // Ignore rollback errors if connection was lost
    });
    throw error;
  } finally {
    client.release();
  }
}
