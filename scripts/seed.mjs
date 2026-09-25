#!/usr/bin/env node
/**
 * scripts/seed.mjs
 *
 * Seeds the company profile and knowledge base into Neon, then generates
 * pgvector embeddings for each knowledge item.
 *
 * Idempotent: re-running updates the profile and replaces knowledge items by
 * title instead of duplicating them.
 *
 * Everything is written into a single tenant (`SEED_TENANT_SLUG`, default
 * `legacy`). Migrations 006/007 create the legacy tenant, so a developer can
 * seed then claim that workspace through the dashboard's legacy-claim flow.
 *
 * Usage: node scripts/seed.mjs
 *        SEED_TENANT_SLUG=acme node scripts/seed.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

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

const CHUNK_SIZE = 500;

const companyProfile = {
  name: "Domweave",
  industry: "Web design & software development agency",
  description: "Domweave builds websites, landing pages, web apps, and custom software for businesses.",
  address: "India",
  contactEmail: "hello@domweave.com",
  contactPhone: "",
};

const knowledgeItems = [
  {
    type: "text",
    title: "Services",
    content:
      "Domweave offers four core services: (1) Business websites — marketing sites, portfolios, and brochure sites. (2) Landing pages — high-conversion single pages for campaigns and product launches. (3) Web applications — custom dashboards, internal tools, and SaaS products. (4) Custom software — bespoke backend systems and integrations built to a client's specific workflow.",
  },
  {
    type: "text",
    title: "Process",
    content:
      "Domweave's typical engagement starts with a discovery call to understand the client's goals, followed by a proposal with scope and timeline, then design, development, review cycles, and launch. Ongoing support and maintenance are available after launch.",
  },
  {
    type: "text",
    title: "Getting a quote",
    content:
      "Pricing depends on project scope. For an accurate quote, Maya should collect the caller's name, the type of project (website, landing page, web app, or custom software), a rough idea of their timeline, and the best way to reach them, then let them know the team will follow up with a proposal.",
  },
  {
    type: "text",
    title: "Booking a call",
    content:
      "If a caller wants to discuss their project in detail, Maya should offer to book an appointment using the bookAppointment tool, collecting their name, preferred date/time, and a short reason (e.g. 'website redesign discussion').",
  },
];

function chunk(text, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

async function embed(apiKey, text, attempt = 1) {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.embedContent({
      model: "gemini-embedding-2",
      contents: text,
    });
    const values = response.embeddings?.[0]?.values;
    if (!values) throw new Error("Embedding model returned no values");
    return values;
  } catch (error) {
    // Free-tier keys are rate limited; back off and retry a few times.
    const isRateLimit = /429|RESOURCE_EXHAUSTED/.test(error?.message ?? "");
    if (isRateLimit && attempt <= 4) {
      const delay = 2000 * attempt;
      console.log(`  … rate limited, retrying in ${delay}ms (attempt ${attempt}/4)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return embed(apiKey, text, attempt + 1);
    }
    throw error;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("FATAL: GEMINI_API_KEY is not set (needed for embeddings).");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  // ── Resolve the target tenant (create it if a custom slug is requested) ────
  const seedSlug = (process.env.SEED_TENANT_SLUG || "legacy").trim().toLowerCase();
  const { rows: tenantRows } = await pool.query(
    `insert into tenants (name, slug) values ($1, $2)
     on conflict (slug) do update set slug = excluded.slug
     returning id`,
    [`${seedSlug} workspace`, seedSlug],
  );
  const tenantId = tenantRows[0].id;
  console.log(`✓ Seeding tenant "${seedSlug}" (${tenantId})`);

  // ── Company profile ───────────────────────────────────────────────────────
  await pool.query(
    `insert into company_profile (tenant_id, name, industry, description, address, contact_email, contact_phone, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (tenant_id) do update set
       name = excluded.name, industry = excluded.industry, description = excluded.description,
       address = excluded.address, contact_email = excluded.contact_email,
       contact_phone = excluded.contact_phone, updated_at = now()`,
    [
      tenantId,
      companyProfile.name,
      companyProfile.industry,
      companyProfile.description,
      companyProfile.address,
      companyProfile.contactEmail,
      companyProfile.contactPhone,
    ],
  );
  console.log("✓ Company profile seeded");

  // ── Knowledge base + embeddings ───────────────────────────────────────────
  for (const item of knowledgeItems) {
    // Replace any existing item with the same title so seeding stays idempotent.
    await pool.query(`delete from knowledge_items where tenant_id = $1 and title = $2`, [
      tenantId,
      item.title,
    ]);

    const { rows } = await pool.query(
      `insert into knowledge_items (tenant_id, type, title, content) values ($1, $2, $3, $4) returning id`,
      [tenantId, item.type, item.title, item.content],
    );
    const itemId = rows[0].id;

    const chunks = chunk(`--- ${item.title} ---\n${item.content}`);
    for (const [index, text] of chunks.entries()) {
      const values = await embed(process.env.GEMINI_API_KEY, text);
      await pool.query(
        `insert into knowledge_embeddings (tenant_id, item_id, chunk_index, chunk_text, embedding)
         values ($1, $2, $3, $4, $5::vector)`,
        [tenantId, itemId, index, text, `[${values.join(",")}]`],
      );
    }
    console.log(`✓ ${item.title} (${chunks.length} chunk${chunks.length === 1 ? "" : "s"} indexed)`);
  }

  console.log("Seeding complete.");
  await pool.end();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
