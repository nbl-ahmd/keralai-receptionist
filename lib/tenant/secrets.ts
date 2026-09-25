/**
 * lib/tenant/secrets.ts
 *
 * Per-tenant provider secrets, encrypted at rest with AES-256-GCM.
 *
 * The master key comes from TENANT_SECRETS_ENCRYPTION_KEY and is never logged
 * or returned. Decrypted values are only handed to trusted server code (the
 * Gemini client for a tenant, CRM webhook signing) and are never serialised to
 * an HTTP response.
 *
 * Server-only.
 */

import crypto from "node:crypto";
import { query, queryOne } from "@/db/client";

export type SecretProvider = "gemini" | "exotel" | "crm" | "webhook" | string;

export interface SecretMeta {
  provider: string;
  keyName: string;
  maskedSuffix: string | null;
  keyVersion: number;
  updatedAt: string;
}

const KEY_BYTES = 32;
const IV_BYTES = 12;

let cachedKey: Buffer | null = null;

/**
 * Derives the 32-byte AES key from TENANT_SECRETS_ENCRYPTION_KEY.
 *
 * Accepts, in order of preference:
 *   - 64 hex characters
 *   - base64 that decodes to exactly 32 bytes
 *   - any other string, hashed with SHA-256 (so a passphrase still works)
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TENANT_SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TENANT_SECRETS_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    cachedKey = Buffer.from(trimmed, "hex");
    return cachedKey;
  }
  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === KEY_BYTES) {
      cachedKey = decoded;
      return cachedKey;
    }
  } catch {
    /* fall through to hash derivation */
  }
  cachedKey = crypto.createHash("sha256").update(trimmed).digest();
  return cachedKey;
}

/**
 * Non-secret fingerprint of the derived master key.
 *
 * Safe to expose/log: it lets an operator confirm the dashboard and the bridge
 * derived the SAME key without revealing the key. A mismatch against the
 * bridge's `secretsKeyFingerprint` is the usual cause of "Unsupported state or
 * unable to authenticate data" during decryption. Mirrors
 * getSecretsKeyFingerprint() in bridge/secrets.mjs.
 */
export function getEncryptionKeyFingerprint(): string | null {
  try {
    return crypto.createHash("sha256").update(getEncryptionKey()).digest("hex").slice(0, 8);
  } catch {
    return null;
  }
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
  };
}

export function decryptSecret(secret: {
  ciphertext: string;
  iv: string;
  auth_tag?: string;
  authTag?: string;
  key_version?: number;
}): string {
  const authTag = secret.authTag ?? secret.auth_tag;
  if (!authTag) throw new Error("Secret is missing its authentication tag");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(secret.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Returns a non-reversible hint (last 4 chars) for display in settings. */
export function maskSecret(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return `••••`;
  return `••••${trimmed.slice(-4)}`;
}

/** Upserts an encrypted secret. Returns only non-sensitive metadata. */
export async function saveTenantSecret(input: {
  tenantId: string;
  provider: string;
  keyName: string;
  value: string;
}): Promise<SecretMeta> {
  const value = input.value.trim();
  if (!value) throw new Error("Secret value is empty");
  const encrypted = encryptSecret(value);
  const masked = maskSecret(value);

  const row = await queryOne<{
    provider: string;
    key_name: string;
    masked_suffix: string | null;
    key_version: number;
    updated_at: string;
  }>(
    `insert into tenant_secrets
       (tenant_id, provider, key_name, ciphertext, iv, auth_tag, key_version, masked_suffix, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (tenant_id, provider, key_name) do update set
       ciphertext = excluded.ciphertext,
       iv = excluded.iv,
       auth_tag = excluded.auth_tag,
       key_version = excluded.key_version,
       masked_suffix = excluded.masked_suffix,
       updated_at = now()
     returning provider, key_name, masked_suffix, key_version, updated_at`,
    [
      input.tenantId,
      input.provider,
      input.keyName,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      encrypted.keyVersion,
      masked,
    ],
  );
  if (!row) throw new Error("Failed to save secret");
  return {
    provider: row.provider,
    keyName: row.key_name,
    maskedSuffix: row.masked_suffix,
    keyVersion: row.key_version,
    updatedAt: row.updated_at,
  };
}

/** Lists secret metadata for a tenant. Never returns ciphertext. */
export async function listTenantSecrets(tenantId: string): Promise<SecretMeta[]> {
  const rows = await query<{
    provider: string;
    key_name: string;
    masked_suffix: string | null;
    key_version: number;
    updated_at: string;
  }>(
    `select provider, key_name, masked_suffix, key_version, updated_at
       from tenant_secrets where tenant_id = $1 order by provider, key_name`,
    [tenantId],
  );
  return rows.map((row) => ({
    provider: row.provider,
    keyName: row.key_name,
    maskedSuffix: row.masked_suffix,
    keyVersion: row.key_version,
    updatedAt: row.updated_at,
  }));
}

/**
 * Decrypts and returns a single secret value for trusted server use.
 * Never expose the return value to a browser.
 */
export async function getTenantSecretValue(
  tenantId: string,
  provider: string,
  keyName: string,
): Promise<string | null> {
  const row = await queryOne<{
    ciphertext: string;
    iv: string;
    auth_tag: string;
    key_version: number;
  }>(
    `select ciphertext, iv, auth_tag, key_version
       from tenant_secrets where tenant_id = $1 and provider = $2 and key_name = $3`,
    [tenantId, provider, keyName],
  );
  if (!row) return null;
  return decryptSecret(row);
}

export async function deleteTenantSecret(
  tenantId: string,
  provider: string,
  keyName: string,
): Promise<void> {
  await query(
    `delete from tenant_secrets where tenant_id = $1 and provider = $2 and key_name = $3`,
    [tenantId, provider, keyName],
  );
}
