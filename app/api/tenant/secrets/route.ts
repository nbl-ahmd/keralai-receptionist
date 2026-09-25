import { NextResponse } from 'next/server';
import {
  deleteTenantSecret,
  listTenantSecrets,
  saveTenantSecret,
} from '@/lib/tenant/secrets';
import { invalidateTenantGeminiCache } from '@/lib/gemini';
import { handleApiError, resolveTenantContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

const PROVIDERS = new Set(['gemini', 'exotel', 'crm', 'webhook']);

function normalizeProvider(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return PROVIDERS.has(trimmed) ? trimmed : null;
}

function normalizeKeyName(value: unknown, provider: string): string | null {
  if (typeof value === 'string' && /^[a-z0-9_]{1,40}$/i.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  // Sensible default per provider so the UI can save with a single field.
  if (provider === 'gemini') return 'api_key';
  if (provider === 'crm' || provider === 'webhook') return 'webhook_secret';
  return 'api_key';
}

/**
 * Provider credentials for the active tenant. Returns metadata only: provider,
 * key name, masked suffix, and timestamps. Ciphertext is never returned.
 */
export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request, { roles: ['owner', 'admin'] });
    return NextResponse.json({ secrets: await listTenantSecrets(tenantId) });
  } catch (error) {
    return handleApiError(error, 'Failed to load provider credentials');
  }
}

/** Saves (or replaces) an encrypted provider secret. Body: { provider, keyName?, value }. */
export async function POST(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request, { roles: ['owner', 'admin'] });
    const body = (await request.json()) as { provider?: string; keyName?: string; value?: string };
    const provider = normalizeProvider(body?.provider);
    if (!provider) {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
    }
    if (typeof body?.value !== 'string' || !body.value.trim()) {
      return NextResponse.json({ error: 'A credential value is required' }, { status: 400 });
    }
    const keyName = normalizeKeyName(body?.keyName, provider);
    if (!keyName) {
      return NextResponse.json({ error: 'Invalid key name' }, { status: 400 });
    }

    const meta = await saveTenantSecret({ tenantId, provider, keyName, value: body.value });

    // A rotated Gemini key must not keep using the cached client.
    if (provider === 'gemini') invalidateTenantGeminiCache(tenantId);

    return NextResponse.json({ success: true, secret: meta });
  } catch (error) {
    return handleApiError(error, 'Failed to save provider credential');
  }
}

/** Removes a provider secret. Query: provider, keyName?. */
export async function DELETE(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request, { roles: ['owner', 'admin'] });
    const params = new URL(request.url).searchParams;
    const provider = normalizeProvider(params.get('provider'));
    if (!provider) {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
    }
    const keyName = normalizeKeyName(params.get('keyName'), provider);
    if (!keyName) {
      return NextResponse.json({ error: 'Invalid key name' }, { status: 400 });
    }

    await deleteTenantSecret(tenantId, provider, keyName);
    if (provider === 'gemini') invalidateTenantGeminiCache(tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to remove provider credential');
  }
}
