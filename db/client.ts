/**
 * db/client.ts
 *
 * Neon Postgres connection for the Next.js dashboard (Vercel deployment).
 *
 * Uses @neondatabase/serverless instead of the bare `pg` Pool.
 * The Neon serverless driver communicates over HTTP (or WebSocket) instead of
 * a persistent TCP socket, which makes it safe for Vercel's serverless and Edge
 * function model — each invocation can safely call neon() without exhausting
 * Neon's per-project connection limit.
 *
 * The pg Pool used by the bridge (bridge/db.mjs) is intentionally separate and
 * remains a standard TCP pool appropriate for a long-lived Render process.
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { type QueryResultRow } from 'pg';


function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Add your Neon connection string to the environment.',
    );
  }
  return neon(connectionString);
}

// Cache the sql tagged-template function across hot reloads in development.
declare global {
  // eslint-disable-next-line no-var
  var __keralaiNeon: NeonQueryFunction<false, false> | undefined;
}

function getSqlCached(): NeonQueryFunction<false, false> {
  if (!global.__keralaiNeon) {
    global.__keralaiNeon = getSql();
  }
  return global.__keralaiNeon;
}

/**
 * Runs a parameterised SQL query and returns typed rows.
 * Compatible with the previous `query<T>(text, params)` call signature.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const sql = getSqlCached();
  // neon() default mode returns an array of row objects
  const rows = (await sql.query(text, params)) as unknown as T[];
  return rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Health check used by /api/health. */
export async function checkDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    await query('select 1');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

