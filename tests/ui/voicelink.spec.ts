import { test, expect } from './fixtures';
import { fixtureInvite } from './invite-fixture';

test('VoiceLink setup is separate from Vobiz and cannot spend or fall through', async ({ page }) => {
  expect((await page.request.get('/api/telephony/voicelink')).status()).toBe(401);
  const email = 'voicelink-choice@example.test';
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: 'http://localhost:3210', 'x-alpha-invite-code': await fixtureInvite(email) },
    data: { name: 'VoiceLink Choice', email, password: 'fixture-password-123' },
  });
  expect(signup.ok()).toBeTruthy();
  await page.request.post('/api/onboarding', { headers: { Origin: 'http://localhost:3210' }, data: { step: 'complete', purpose: 'personal' } });
  const status = await page.request.get('/api/telephony/voicelink');
  expect(status.headers()['cache-control']).toBe('private, no-store');
  expect(await status.json()).toMatchObject({ provider: 'voicelink', activationReady: false, provisioningSupported: false, quote: null });
  for (const path of ['/api/telephony/voicelink', '/api/telephony/account', '/api/telephony/numbers/purchase']) {
    const response = await page.request.post(path, { headers: { Origin: 'http://localhost:3210' }, data: { provider: 'voicelink' } });
    expect(response.status()).toBe(503);
    expect((await response.json()).error).toContain('VoiceLink activation is pending');
  }
  expect((await page.request.post('/api/telephony/voicelink', { headers: { Origin: 'https://other.example' }, data: {} })).status()).toBe(403);
  expect((await page.request.get('/api/telephony/account?provider=unknown')).status()).toBe(400);
  expect((await page.request.get('/api/telephony/account?provider=voicelink')).status()).toBe(503);
  expect((await (await page.request.get('/api/telephony/account')).json()).account).toBeNull();

  let vobizRequests = 0;
  page.on('request', request => { if (request.url().includes('/api/telephony/account')) vobizRequests++; });
  await page.goto('/dashboard/phone?provider=voicelink');
  await expect(page.getByRole('heading', { name: 'VoiceLink setup' })).toBeVisible();
  await expect(page.getByText('Quote required.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activate number' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'VoiceLink', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const width of [320, 360, 375, 390, 414, 768, 834, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  expect(vobizRequests).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-output/voicelink-390.png', fullPage: true });
  await page.getByRole('link', { name: 'Vobiz', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Vobiz', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Get a phone number' })).toBeVisible();
});

test('VoiceLink operator quote includes channel costs and is labelled as an estimate', async ({ page }) => {
  const email = 'voicelink-quote@example.test';
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: 'http://localhost:3210', 'x-alpha-invite-code': await fixtureInvite(email) },
    data: { name: 'VoiceLink Quote', email, password: 'fixture-password-123' },
  });
  expect(signup.ok()).toBeTruthy();
  await page.request.post('/api/onboarding', { headers: { Origin: 'http://localhost:3210' }, data: { step: 'complete', purpose: 'personal' } });
  // Synthetic UI fixture only; these are not VoiceLink's actual rates.
  await page.route('**/api/telephony/voicelink', route => route.fulfill({ json: {
    provider: 'voicelink', activationReady: false, provisioningSupported: false, status: 'awaiting_provider_contract',
    quote: { reference: 'synthetic-test', numberMonthlyMinor: 20000, channelMonthlyMinor: 10000, inboundMinuteMinor: 38, outboundMinuteMinor: 38 }, blockers: [],
  } }));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/dashboard/phone?provider=voicelink');
  await expect(page.getByRole('cell', { name: '₹322.80', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '₹414.00', exact: true })).toBeVisible();
  await expect(page.getByText('Illustrative usage estimate, not a purchase quote.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
