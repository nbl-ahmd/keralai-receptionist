import { Pool, type PoolClient } from 'pg';

let pool: Pool | undefined;
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) throw new Error('Database unavailable');
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3,
      connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000,
      query_timeout: 15000, statement_timeout: 15000, lock_timeout: 10000, keepAlive: true, application_name: 'keralai-management' });
    pool.on('error', () => {
      console.warn(JSON.stringify({ event:'management.database.idle_connection_failed' }));
    });
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
