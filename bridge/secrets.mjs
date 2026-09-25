/**
 * bridge/secrets.mjs
 *
 * Per-tenant secret decryption for the standalone bridge.
 *
 * Mirrors lib/tenant/secrets.ts exactly (AES-256-GCM, TENANT_SECRETS_ENCRYPTION_KEY)
 * so both processes read the same ciphertext. The bridge must share the same
 * master key as the dashboard via the environment.
 *
 * Decrypted values are only handed to trusted server code (the per-tenant Gemini
 * client). They are never logged and never sent to a browser.
 */

import crypto from 'node:crypto';
import { dbQuery } from './db.mjs';

const KEY_BYTES = 32;

let cachedKey = null;

function getEncryptionKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.TENANT_SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'TENANT_SECRETS_ENCRYPTION_KEY is not set. It must match the dashboard.',
    );
  }
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    cachedKey = Buffer.from(trimmed, 'hex');
    return cachedKey;
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === KEY_BYTES) {
      cachedKey = decoded;
      return cachedKey;
    }
  } catch {
    /* fall through to hash derivation */
  }
  cachedKey = crypto.createHash('sha256').update(trimmed).digest();
  return cachedKey;
}

/**
 * Non-secret fingerprint of the derived master key.
 *
 * Safe to expose/log: it lets an operator confirm the dashboard and the bridge
 * derived the SAME key without ever revealing the key. A mismatch here is the
 * usual cause of "Unsupported state or unable to authenticate data" during
 * decryption. Mirrors getEncryptionKeyFingerprint() in lib/tenant/secrets.ts.
 *
 * @returns {string | null} 8 hex chars, or null when the key is not configured.
 */
export function getSecretsKeyFingerprint() {
  try {
    return crypto.createHash('sha256').update(getEncryptionKey()).digest('hex').slice(0, 8);
  } catch {
    return null;
  }
}

export function decryptSecret(secret) {
  const authTag = secret.authTag ?? secret.auth_tag;
  if (!authTag) throw new Error('Secret is missing its authentication tag');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(secret.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/**
 * Decrypts and returns a single secret value for trusted server use.
 * Returns null when unset. Never log or return this to a browser.
 */
/**
 * Thrown when a stored secret cannot be decrypted. In practice this almost
 * always means the dashboard and the bridge are using different
 * `TENANT_SECRETS_ENCRYPTION_KEY` values (the AES-GCM auth tag fails), which is
 * the usual cause of phone calls ending the moment they connect.
 */
export class SecretDecryptError extends Error {
  constructor(tenantId, provider, keyName, cause) {
    super(
      `Stored ${provider}.${keyName} secret for tenant ${tenantId} could not be decrypted. ` +
        'TENANT_SECRETS_ENCRYPTION_KEY must be byte-identical on the dashboard (Vercel) ' +
        'and the bridge (Render). Re-save the credential after fixing the key.',
    );
    this.name = 'SecretDecryptError';
    this.cause = cause;
  }
}

export async function getTenantSecretValue(tenantId, provider, keyName) {
  const rows = await dbQuery(
    `select ciphertext, iv, auth_tag from tenant_secrets
      where tenant_id = $1 and provider = $2 and key_name = $3`,
    [tenantId, provider, keyName],
  );
  if (!rows[0]) return null;
  try {
    return decryptSecret(rows[0]);
  } catch (error) {
    throw new SecretDecryptError(tenantId, provider, keyName, error);
  }
}

/**
 * Attempts to decrypt every tenant's Gemini key. Returns how many are healthy
 * and which tenant slugs are undecryptable, so a master-key mismatch is
 * obvious in the startup logs without ever touching secret values.
 */
export async function auditTenantGeminiKeys() {
  const rows = await dbQuery(
    `select ts.ciphertext, ts.iv, ts.auth_tag, t.slug
       from tenant_secrets ts
       join tenants t on t.id = ts.tenant_id
      where ts.provider = 'gemini' and ts.key_name = 'api_key'
      order by t.slug`,
  );
  const result = { configured: 0, undecryptable: [] };
  for (const row of rows) {
    try {
      const value = decryptSecret(row);
      if (value) result.configured++;
    } catch {
      result.undecryptable.push(row.slug);
    }
  }
  return result;
}

/** Non-reversible display hint (last 4 chars); mirrors the dashboard. */
export function maskSecret(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return '••••';
  return `••••${trimmed.slice(-4)}`;
}

/** AES-256-GCM encrypts a plaintext secret into the stored column shape. */
export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: 1,
  };
}

/**
 * Upserts an encrypted secret, matching lib/tenant/secrets.ts so the dashboard
 * and bridge read the same ciphertext. Used for the one-time legacy credential
 * import; ordinary tenant credentials are saved from the dashboard. Never logs
 * the value.
 */
export async function saveTenantSecret({ tenantId, provider, keyName, value }) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) throw new Error('Secret value is empty');
  const encrypted = encryptSecret(trimmed);
  await dbQuery(
    `insert into tenant_secrets
       (tenant_id, provider, key_name, ciphertext, iv, auth_tag, key_version, masked_suffix, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (tenant_id, provider, key_name) do update set
       ciphertext = excluded.ciphertext,
       iv = excluded.iv,
       auth_tag = excluded.auth_tag,
       key_version = excluded.key_version,
       masked_suffix = excluded.masked_suffix,
       updated_at = now()`,
    [
      tenantId,
      provider,
      keyName,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      encrypted.keyVersion,
      maskSecret(trimmed),
    ],
  );
}
