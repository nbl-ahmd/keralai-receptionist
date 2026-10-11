// Canonical, server-only credential/model selection shared by both services.
import { AlphaAccessError } from './alpha-policy.mjs';
export async function resolveTenantAiConfiguration(tenantId, { query, readSecret, consume = false }) {
  const [row] = await query(`select c.credential_mode,t.status from tenant_ai_configuration c
    join tenants t on t.id=c.tenant_id where c.tenant_id=$1`, [tenantId]);
  if (!row || row.status !== 'active') throw new AlphaAccessError(403, 'AI is unavailable for this workspace.');
  const credentialMode = row.credential_mode;
  if (!['platform_managed','tenant_managed'].includes(credentialMode)) throw new AlphaAccessError(503, 'AI configuration is invalid.');
  const stage = process.env.AI_ENVIRONMENT ?? 'development';
  if (!['development','alpha','production'].includes(stage) ||
      (stage === 'production' && (process.env.TEST_SCHEMA || process.env.KERALAI_TEST_SCHEMA)))
    throw new AlphaAccessError(503, 'AI environment is invalid for this process.');
  if(consume) {
    const [subscription]=await query(`select s.status,p.active from tenant_subscriptions s
      join plans p on p.code=s.plan_code where s.tenant_id=$1`,[tenantId]);
    if(subscription?.status!=='active'||subscription.active!==true)throw new AlphaAccessError(403,'Your AI plan is inactive. Contact your organiser.');
  }
  const managed = credentialMode === 'platform_managed';
  const apiKey = managed ? (process.env.PLATFORM_GEMINI_API_KEY ?? '').trim() :
    await readSecret(tenantId, 'gemini', 'api_key');
  // Never infer a different mode from key availability.
  if (consume && !apiKey) throw new AlphaAccessError(503, managed ?
    'KeralAI AI is not configured. Contact your test organiser.' : 'Add your own AI key in Advanced settings.');
  if (consume && managed) {
    const raw = process.env.ALPHA_AI_DAILY_REQUEST_LIMIT ?? '20', limit = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
      throw new AlphaAccessError(503, 'AI daily allowance is invalid.');
    const rows = await query(`insert into alpha_ai_daily_usage(tenant_id,usage_date,requests)
      values($1,(now() at time zone 'UTC')::date,1)
      on conflict(tenant_id,usage_date) do update set requests=alpha_ai_daily_usage.requests+1
      where alpha_ai_daily_usage.requests<$2 returning requests`, [tenantId,limit]);
    if (!rows.length) throw new AlphaAccessError(429, 'Your daily AI allowance is used. Try again tomorrow.');
  }
  const settings = managed ? [] : await query(`select key,value from tenant_settings
    where tenant_id=$1 and key=any($2::text[])`, [tenantId,['gemini.text_model','gemini.live_model','gemini.embedding_model']]);
  const model = (key, fallback) => {
    const value = settings.find(s => s.key === key)?.value;
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  };
  return { credentialMode, apiKey: apiKey || null,
    textModel: model('gemini.text_model',process.env.GENAI_MODEL || 'gemini-flash-lite-latest'),
    liveModel: model('gemini.live_model',process.env.GEMINI_MODEL || 'gemini-3.8-live'),
    embeddingModel: model('gemini.embedding_model',process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2') };
}
