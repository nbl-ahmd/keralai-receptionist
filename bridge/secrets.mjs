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
export async function getTenantSecretValue(tenantId, provider, keyName) {
  const rows = await dbQuery(
    `select ciphertext, iv, auth_tag from tenant_secrets
      where tenant_id = $1 and provider = $2 and key_name = $3`,
    [tenantId, provider, keyName],
  );
  if (!rows[0]) return null;
  return decryptSecret(rows[0]);
}
