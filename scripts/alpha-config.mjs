// Configuration evidence only: never prints credentials or grants live readiness.
export function alphaConfiguration(app, bridge) {
  const browserBlockers = [], phoneBlockers = [];
  const configured = value => typeof value === 'string' && value.trim() && !/replace_with|YOUR_|example\.com/.test(value);
  /** @type {Record<string, boolean>} */
  const matches = {};
  for (const key of ['DATABASE_URL', 'BRIDGE_AUTH_SECRET', 'TENANT_SECRETS_ENCRYPTION_KEY', 'PLATFORM_GEMINI_API_KEY']) {
    matches[key] = Boolean(configured(app[key]) && configured(bridge[key]) && app[key] === bridge[key]);
    if (!matches[key]) browserBlockers.push(`${key}: missing or mismatched`);
  }
  if (!configured(app.BETTER_AUTH_SECRET) || app.BETTER_AUTH_SECRET.length < 32)
    browserBlockers.push('BETTER_AUTH_SECRET: strong unique secret required');
  const origin = value => {
    try {
      const u = new URL(value);
      return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? u.origin : null;
    } catch { return null; }
  };
  const appOrigin = origin(app.BETTER_AUTH_URL);
  if (!appOrigin || origin(app.NEXT_PUBLIC_APP_URL) !== appOrigin)
    browserBlockers.push('Auth/public app origins: missing or mismatched');
  if (!appOrigin || !bridge.PUBLIC_APP_ORIGIN?.split(',').map(s => s.trim()).includes(appOrigin))
    browserBlockers.push('Bridge browser origin: app origin not allowed');
  if (!configured(app.PLATFORM_ADMIN_USER_IDS)) browserBlockers.push('Operator user-ID allowlist: missing');
  if (app.ALPHA_INVITE_ISSUANCE_ENABLED !== '1') browserBlockers.push('Invitation issuance: disabled');
  for (const [name, env] of [['app', app], ['bridge', bridge]]) {
    if (env.TEST_SCHEMA || env.KERALAI_TEST_SCHEMA) browserBlockers.push(`${name}: test schema configured`);
    if (env.AI_ENVIRONMENT !== 'alpha') browserBlockers.push(`${name}: AI_ENVIRONMENT must be alpha for acceptance`);
    if (env.PLATFORM_BROWSER_VOICE_ENABLED !== '1') browserBlockers.push(`${name}: browser voice disabled`);
    if (env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED !== '1') phoneBlockers.push(`${name}: callback signature evidence pending`);
    if (env.PLATFORM_NEW_PHONE_CALLS_ENABLED !== '1') phoneBlockers.push(`${name}: phone calls disabled`);
  }
  if (app.PLATFORM_NUMBER_PURCHASE_ENABLED !== '1') phoneBlockers.push('Number purchase: disabled');
  for (const key of ['VOBIZ_AUTH_ID', 'VOBIZ_AUTH_TOKEN', 'CRON_SECRET'])
    if (!configured(app[key])) phoneBlockers.push(`${key}: missing`);
  for (const key of ['PHONE_MONTHLY_PRICE_MINOR', 'PHONE_SETUP_PRICE_MINOR', 'CALL_PRICE_PER_MINUTE_MINOR', 'PROVIDER_VOICE_RESERVE_MINOR_PER_MINUTE']) {
    if (!/^\d+$/.test(app[key] ?? '') || !Number.isSafeInteger(Number(app[key])) || Number(app[key]) <= 0)
      phoneBlockers.push(`${key}: approved positive integer price required`);
  }
  for (const key of ['ALPHA_MAX_DID_SETUP_COST_MINOR','ALPHA_MAX_DID_MONTHLY_COST_MINOR','ALPHA_DID_RELEASE_COST_MINOR','ALPHA_MAX_DID_RELEASE_COST_MINOR','ALPHA_MAX_DID_COMMITMENT_MONTHS','ALPHA_MIN_VOBIZ_BALANCE_MINOR'])
    if (!/^\d+$/.test(app[key] ?? '') || !Number.isSafeInteger(Number(app[key])))phoneBlockers.push(`${key}: operator-approved policy required`);
  return {matches, browserBlockers, phoneBlockers, liveGemini: 'NOT_VALIDATED', livePhone: 'NOT_VALIDATED'};
}
