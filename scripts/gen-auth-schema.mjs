#!/usr/bin/env node
/**
 * scripts/gen-auth-schema.mjs
 *
 * Development helper: prints the Better Auth core SQL schema for the installed
 * better-auth version, compiled for Postgres. Used once to author the
 * multitenancy migration; not part of the runtime.
 *
 *   node scripts/gen-auth-schema.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  break;
}

const { betterAuth } = await import("better-auth");
const { getMigrations } = await import("better-auth/db/migration");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || "schema-gen-placeholder-secret-value-000000",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  emailAndPassword: { enabled: true, autoSignIn: true, requireEmailVerification: false },
});

const { compileMigrations } = await getMigrations(auth.options);
console.log(await compileMigrations());
await pool.end();
