/**
 * lib/auth/server.ts
 *
 * Better Auth instance for the Next.js dashboard.
 *
 * Uses a `pg` Pool (Node runtime) against the existing Neon Postgres database.
 * The core auth tables (user/session/account/verification) were created by the
 * numbered migrations; Better Auth does not manage the schema at runtime.
 *
 * Instance creation is lazy so importing this module during a build (or in a
 * route that never handles auth) does not require DATABASE_URL.
 *
 * Server-only.
 */

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";
import { provisionTenantForUser } from "../tenant/provision";

declare global {
  // eslint-disable-next-line no-var
  var __keralaiAuthPgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __keralaiAuth: ReturnType<typeof createAuth> | undefined;
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  if (!global.__keralaiAuthPgPool) {
    global.__keralaiAuthPgPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "keralai-next-auth",
      ssl: connectionString.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return global.__keralaiAuthPgPool;
}

function trustedOrigins(): string[] {
  const origins = new Set<string>([
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
  ]);
  const add = (value: string | undefined) => {
    if (!value) return;
    for (const part of value.split(",")) {
      const trimmed = part.trim().replace(/\/+$/, "");
      if (trimmed) origins.add(trimmed);
    }
  };
  add(process.env.BETTER_AUTH_URL);
  add(process.env.PUBLIC_APP_ORIGIN);
  add(process.env.NEXT_PUBLIC_APP_URL);
  return [...origins];
}

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    console.warn(
      "[auth] BETTER_AUTH_SECRET is not set. Set it in .env.local and in your hosting provider.",
    );
  }
  return betterAuth({
    appName: "KeralAI Receptionist",
    database: getPool(),
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: trustedOrigins(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              await provisionTenantForUser({
                id: user.id,
                email: user.email,
                name: user.name,
              });
            } catch (error) {
              // Never fail signup on provisioning; the first authenticated
              // request self-heals via ensureTenantAccess().
              console.error("[auth] Tenant provisioning failed:", error);
            }
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

/** Lazily-created, cached Better Auth instance. */
export function getAuth(): ReturnType<typeof createAuth> {
  if (!global.__keralaiAuth) {
    global.__keralaiAuth = createAuth();
  }
  return global.__keralaiAuth;
}

/** Direct handler for the catch-all auth route. */
export function handleAuthRequest(request: Request): Promise<Response> {
  return getAuth().handler(request);
}
