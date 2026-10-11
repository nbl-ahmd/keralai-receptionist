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

import { transaction } from '@/db/transaction';
import { lockInvite, provisionInvitedTenant, validInviteToken, inviteRateLimit } from '@/lib/alpha/invites';
import { HttpError } from './context';
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";
import { provisionTenantForUser } from "../tenant/provision";

declare global {
  var __keralaiAuthPgPool: Pool | undefined;
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
      query_timeout: 15000, statement_timeout: 15000, keepAlive: true,
      application_name: "keralai-next-auth",

    });
    // Idle connections can be closed by the database or network. pg removes
    // failed clients; handle its error event without dumping client credentials.
    global.__keralaiAuthPgPool.on("error", () => {
      console.warn(JSON.stringify({ event: "auth.database.idle_connection_failed" }));
    });
  }
  return global.__keralaiAuthPgPool;
}

function trustedOrigins(): string[] {
  const origins = new Set<string>(process.env.NODE_ENV === "production" ? [] : [
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

function createAuth(database: Pool = getPool(), invited = false) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    console.warn(
      "[auth] BETTER_AUTH_SECRET is not set. Set it in .env.local and in your hosting provider.",
    );
  }
  return betterAuth({
    appName: "KeralAI Receptionist",
    database,
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
    databaseHooks: invited ? {} : {
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
              console.error(JSON.stringify({event:"auth.tenant_provision.failed",code:error instanceof Error ? error.name : "unknown"}));
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
export async function handleAuthRequest(request: Request): Promise<Response> {
  let path: string;
  try { path = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, ""); }
  catch { return Response.json({ message:"Invalid request path" }, { status:400 }); }
  if (request.method === 'POST' && /\/(sign-up|sign-in)\//.test(path) && !path.endsWith('/email'))
    return Response.json({message:'Closed alpha uses email accounts.'},{status:403});
  if(request.method==='POST' && path.endsWith('/sign-in/email')) {
    try { if((await request.clone().text()).length>16384)throw new HttpError(413,'Request too large.');
      const body=await request.clone().json();await inviteRateLimit('anonymous','auth-global',120);
      await inviteRateLimit(typeof body.email==='string'?body.email.toLowerCase().slice(0,254):'anonymous','signin',10);
    }catch(e){return Response.json({message:e instanceof HttpError?e.message:'Unable to sign in.'},{status:e instanceof HttpError?e.status:503});}
  }
  if (request.method !== 'POST' || !path.endsWith('/sign-up/email')) return getAuth().handler(request);
  const raw=request.headers.get('x-alpha-invite-code');
  if(!validInviteToken(raw))return Response.json({message:'An active invitation is required.'},{status:403});
  try {
    if((await request.clone().text()).length>16384)throw new HttpError(413,'Request too large.');
    const body=await request.clone().json();
    if(typeof body.email!=='string')throw new HttpError(400,'Email is required.');
    await inviteRateLimit(body.email.toLowerCase(),'signup',6);
    return await transaction(async client=>{
      const invite=await lockInvite(client,raw,body.email);
      // Bind Better Auth's pg adapter to this connection. Its inner transaction
      // uses a savepoint; only the outer transaction can commit signup + access.
      const boundClient={
        query: (sql:string,params?:unknown[]) => {
          const text=sql.trim().toLowerCase();
          if(text==='begin')return client.query('savepoint alpha_auth');
          if(text==='commit')return client.query('release savepoint alpha_auth');
          if(text==='rollback')return client.query('rollback to savepoint alpha_auth');
          return client.query(sql,params);
        }, release:()=>undefined,
      };
      const boundPool={connect:async()=>boundClient,end:async()=>undefined} as unknown as Pool;
      const response=await createAuth(boundPool,true).handler(request);
      if(!response.ok)throw Object.assign(new Error('Signup failed'),{response});
      const result=await response.clone().json();
      if(!result.user?.id)throw new HttpError(503,'Unable to create workspace.');
      const tenantId=await provisionInvitedTenant(client,result.user,invite.id);
      console.info(JSON.stringify({event:'alpha.invite.redeemed',tenantId}));
      return response;
    });
  }catch(error){
    if(error && typeof error==='object' && 'response' in error && error.response instanceof Response)return error.response;
    return Response.json({message:error instanceof HttpError?error.message:'Unable to create your workspace.'},{status:error instanceof HttpError?error.status:503});
  }
}
