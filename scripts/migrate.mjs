#!/usr/bin/env node
/**
 * scripts/migrate.mjs
 *
 * Applies every SQL file in db/migrations in filename order, tracking applied
 * migrations in a schema_migrations table so re-runs are safe.
 *
 * Usage:
 *   node scripts/migrate.mjs            # apply pending migrations
 *   node scripts/migrate.mjs --status   # show applied/pending
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const migrationsDir = path.join(rootDir, "db", "migrations");

// Load .env.local the same way server.mjs does (plain node has no dotenv).
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const envPath = path.join(rootDir, file);
    if (!fs.existsSync(envPath)) continue;
    for (const raw of fs.readFileSync(envPath, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    break;
  }
}

loadEnv();

const showStatusOnly = process.argv.includes("--status");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await pool.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await pool.query("select name from schema_migrations")).rows.map((row) => row.name),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const pending = files.filter((file) => !applied.has(file));

  if (showStatusOnly) {
    for (const file of files) {
      console.log(`${applied.has(file) ? "[applied]" : "[pending]"} ${file}`);
    }
    await pool.end();
    return;
  }

  if (pending.length === 0) {
    console.log("No pending migrations.");
    await pool.end();
    return;
  }

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}…`);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`  ✓ ${file}`);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      console.error(`  ✗ ${file} failed:`, error.message);
      client.release();
      await pool.end();
      process.exit(1);
    }
    client.release();
  }

  console.log(`Applied ${pending.length} migration(s).`);
  await pool.end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
