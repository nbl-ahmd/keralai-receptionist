import { NextResponse } from 'next/server';
import {
  deleteTenantSetting,
  getTenantSettings,
  SETTING_KEYS,
  setTenantSetting,
} from '@/lib/tenant/settings';
import { invalidateTenantGeminiCache } from '@/lib/gemini';
import { handleApiError, resolveTenantContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

const ALLOWED_MODELS = new Set<string>([
  SETTING_KEYS.geminiTextModel,
  SETTING_KEYS.geminiLiveModel,
  SETTING_KEYS.geminiEmbeddingModel,
]);

/** Returns the tenant's non-secret settings. Never includes secrets. */
export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request, { roles: ['owner', 'admin'] });
    return NextResponse.json({ settings: await getTenantSettings(tenantId) });
  } catch (error) {
    return handleApiError(error, 'Failed to load settings');
  }
}

/**
 * Upserts a single non-secret setting. Body: { key, value }.
 * Passing value === null deletes the override and restores the default.
 */
export async function PATCH(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request, { roles: ['owner', 'admin'] });
    const body = (await request.json()) as { key?: string; value?: unknown };
    const key = body?.key;
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'A setting key is required' }, { status: 400 });
    }

    if (body.value === null || body.value === undefined || body.value === '') {
      await deleteTenantSetting(tenantId, key);
      return NextResponse.json({ success: true, settings: await getTenantSettings(tenantId) });
    }

    if (ALLOWED_MODELS.has(key)) {
      if (typeof body.value !== 'string') {
        return NextResponse.json({ error: 'Model setting must be a string' }, { status: 400 });
      }
      await setTenantSetting(tenantId, key, body.value.trim().slice(0, 120));
      if (key === SETTING_KEYS.geminiTextModel || key === SETTING_KEYS.geminiEmbeddingModel) {
        invalidateTenantGeminiCache(tenantId);
      }
    } else if (key === SETTING_KEYS.crmProvider) {
      if (body.value !== 'none' && body.value !== 'webhook') {
        return NextResponse.json({ error: 'Unsupported CRM provider' }, { status: 400 });
      }
      await setTenantSetting(tenantId, key, body.value);
    } else if (key === SETTING_KEYS.crmWebhookUrl) {
      if (typeof body.value !== 'string' || !/^https?:\/\//i.test(body.value)) {
        return NextResponse.json({ error: 'Webhook URL must start with http:// or https://' }, { status: 400 });
      }
      await setTenantSetting(tenantId, key, body.value.trim().slice(0, 500));
    } else {
      return NextResponse.json({ error: 'Unknown setting key' }, { status: 400 });
    }

    return NextResponse.json({ success: true, settings: await getTenantSettings(tenantId) });
  } catch (error) {
    return handleApiError(error, 'Failed to save setting');
  }
}
