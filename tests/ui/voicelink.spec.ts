import { test, expect } from './fixtures';
import { fixtureInvite } from './invite-fixture';

test('Connected VoiceLink setup gives the correct next step and enables eligible account creation', async ({ page }) => {
  const email = 'voicelink-ready-account@example.test';
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: 'http://localhost:3210', 'x-alpha-invite-code': await fixtureInvite(email) },
    data: { name: 'Ready Tester', email, password: 'fixture-password-123' },
  });
  expect(signup.ok()).toBeTruthy();
  await page.request.post('/api/onboarding', { headers: { Origin: 'http://localhost:3210' }, data: { step: 'complete', purpose: 'personal' } });
  await page.route('**/api/telephony/account?provider=voicelink', route => route.fulfill({ json: {
    account: null, phoneActivationApproved: true, browserTestCompleted: true,
  } }));
  await page.route('**/api/telephony/voicelink', route => route.fulfill({ json: { configured: true, accountCreationAvailable: true,
    accountCreationBlocker: null, currentPlan: { name: 'Trial Pack', availableChannels: 1, pulseSeconds: 60 }, quote: null, blockers: [] } }));
  await page.goto('/dashboard/phone?provider=voicelink');
  await expect(page.getByText('VoiceLink is connected.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create VoiceLink account' })).toBeEnabled();
  await expect(page.getByText('Calling awaiting verification', { exact: true })).toBeVisible();
  await expect(page.getByText('available when your operator connects', { exact: false })).toHaveCount(0);
});

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
  expect(await status.json()).toMatchObject({ provider: 'voicelink', activationReady: false, provisioningSupported: false, accountSetupSupported: true, configured: false, quote: null });
  for (const path of ['/api/telephony/voicelink', '/api/telephony/numbers/purchase']) {
    const response = await page.request.post(path, { headers: { Origin: 'http://localhost:3210' }, data: { provider: 'voicelink' } });
    expect(response.status()).toBe(503);
    expect((await response.json()).error).toContain('VoiceLink activation is pending');
  }
  expect((await page.request.post('/api/telephony/account?provider=voicelink', { headers: { Origin: 'http://localhost:3210' }, data: { provider: 'vobiz' } })).status()).toBe(400);
  expect((await page.request.post('/api/telephony/voicelink', { headers: { Origin: 'https://other.example' }, data: {} })).status()).toBe(403);
  expect((await page.request.get('/api/telephony/account?provider=unknown')).status()).toBe(400);
  expect((await page.request.get('/api/telephony/voicelink?provider=vobiz')).status()).toBe(400);
  expect((await page.request.post('/api/telephony/voicelink/checkout',{headers:{Origin:'http://localhost:3210'},data:{provider:'vobiz',e164:'+918012345678'}})).status()).toBe(400);
  expect((await (await page.request.get('/api/telephony/account?provider=voicelink')).json()).account).toBeNull();
  expect((await (await page.request.get('/api/telephony/account')).json()).account).toBeNull();

  let vobizRequests = 0;
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/telephony/account' && url.searchParams.get('provider') !== 'voicelink') vobizRequests++; });
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

test('VoiceLink customer can request a quote but cannot pay with unknown exit terms', async ({ page }) => {
  const email = 'voicelink-checkout-ui@example.test';
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers: { Origin: 'http://localhost:3210', 'x-alpha-invite-code': await fixtureInvite(email) },
    data: { name: 'Checkout Tester', email, password: 'fixture-password-123' },
  });
  expect(signup.ok()).toBeTruthy();
  await page.request.post('/api/onboarding', { headers: { Origin: 'http://localhost:3210' }, data: { step: 'complete', purpose: 'personal' } });
  await page.route('**/api/telephony/account?provider=voicelink', route => route.fulfill({ json: {
    account: { status: 'active', kycStatus: 'verified', callsBlocked: false }, phoneActivationApproved: true, browserTestCompleted: true,
  } }));
  await page.route('**/api/telephony/voicelink', route => route.fulfill({ json: { configured: true, quote: null, blockers: [] } }));
  await page.route('**/api/telephony/voicelink/inventory', route => route.fulfill({ json: {
    items: [{ e164: '+918012345678', region: 'Synthetic', monthlyCost: '299.00', channelMonthlyCost: '199.00' }],
  } }));
  let drafts = 0, confirmations = 0;
  await page.route('**/api/telephony/voicelink/checkout', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { checkout: null } });
    drafts++;
    expect(route.request().headers()['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/);
    expect(route.request().postDataJSON().e164).toBe('+918012345678');
    await route.fulfill({ json: { id: 'fixture-checkout', e164: '+918012345678', state: 'quoted', quote: { totalMinor: 29900, monthlyMinor: 29900 },
      terms: null, customerPrice: null, confirmationAvailable: false, confirmationBlocker: 'Release terms need confirmation.' } });
  });
  await page.route('**/api/telephony/voicelink/checkout/confirm', async route => { confirmations++; await route.abort(); });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/dashboard/phone?provider=voicelink');
  await page.getByRole('button', { name: 'Browse VoiceLink numbers' }).click();
  await page.getByRole('button', { name: 'Request number quote' }).click();
  await expect(page.getByText('Checkout status: quoted')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Purchase and assign number' })).toBeDisabled();
  await expect(page.getByRole('checkbox')).toBeDisabled();
  expect(drafts).toBe(1); expect(confirmations).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('VoiceLink uncertainty stays actionable and cannot trigger another purchase on mobile', async ({page}) => {
  const email='voicelink-recovery-ui@example.test';
  const signup=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite(email)},data:{name:'Recovery Tester',email,password:'fixture-password-123'}});
  expect(signup.ok()).toBeTruthy();
  await page.request.post('/api/onboarding',{headers:{Origin:'http://localhost:3210'},data:{step:'complete',purpose:'personal'}});
  await page.route('**/api/telephony/account?provider=voicelink',route=>route.fulfill({json:{account:{status:'active',kycStatus:'verified',callsBlocked:false}}}));
  await page.route('**/api/telephony/voicelink',route=>route.fulfill({json:{configured:true,quote:null,blockers:[]}}));
  await page.route('**/api/telephony/voicelink/checkout',route=>route.fulfill({json:{checkout:{id:'fixture',e164:'+918012345678',state:'purchase_unknown',confirmationAvailable:false,
    recoveryMessage:'Payment and assignment will not be repeated. Your operator is checking client-owned inventory.',quote:null,terms:null,customerPrice:null}}}));
  let paid=0;
  await page.route('**/api/telephony/voicelink/checkout/confirm',route=>{paid++;return route.abort();});
  await page.setViewportSize({width:320,height:700});await page.goto('/dashboard/phone?provider=voicelink');
  await expect(page.getByText('Checkout status: purchase unknown')).toBeVisible();
  await expect(page.getByText('Payment and assignment will not be repeated.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Purchase and assign number'})).toBeDisabled();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByText('Checkout status: purchase unknown')).toBeVisible();expect(paid).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});

test('operator recovery dispatches VoiceLink and requires a reference before unpaid closure', async ({page}) => {
  const email='voicelink-operator-ui@example.test';
  const signup=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite(email)},data:{name:'Operator Tester',email,password:'fixture-password-123'}});
  expect(signup.ok()).toBeTruthy();
  await page.request.post('/api/onboarding',{headers:{Origin:'http://localhost:3210'},data:{step:'complete',purpose:'personal'}});
  // A tenant owner is not a real platform operator.
  expect((await page.request.get('/api/admin/telephony')).status()).toBe(403);
  const actions:Array<Record<string,unknown>>=[];
  await page.route('**/api/admin/telephony*',async route=>{
    if(route.request().method()==='POST'){actions.push(route.request().postDataJSON());return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:{items:[{id:'fixture-tenant',provider:'voicelink',name:'Synthetic VoiceLink workspace',provider_auth_id:'501',provider_username:'ka_fixture',kyc_status:'verified',kyc_calls_blocked:false,balance_minor:'0',pending_calls:0,failed_calls:0,recent_usage:[],checkout:{id:'fixture',state:'draft_unknown',e164:'+918012345678',code:'draft_reference_missing',orderId:null}}],page:1}});
  });
  await page.route('**/api/admin/alpha',route=>route.fulfill({json:{tenants:[],invites:[],controls:{},metrics:{}}}));
  await page.setViewportSize({width:320,height:700});await page.goto('/dashboard/admin');
  await page.getByLabel('Reason for phone operations').fill('Read-only support reconciliation');
  await page.getByRole('button',{name:'Check saved checkout'}).click();
  expect(actions[0]).toMatchObject({provider:'voicelink',action:'reconcile_voicelink_checkout'});
  await page.getByRole('button',{name:'Resolve closed draft'}).click();
  await expect(page.getByRole('button',{name:'Record draft closure'})).toBeDisabled();
  await page.getByLabel('VoiceLink support reference').fill('SUPPORT-UI-FIXTURE');
  await page.getByRole('checkbox',{name:'VoiceLink confirmed this original draft is closed and unpaid.'}).check();
  await page.getByRole('button',{name:'Record draft closure'}).click();
  expect(actions.at(-1)).toMatchObject({provider:'voicelink',action:'close_voicelink_draft',reference:'SUPPORT-UI-FIXTURE',providerDraftClosed:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:'.test-output/voicelink-operator-320.png',fullPage:true});
});

test('inventory failure preserves account and checkout recovery instead of hiding setup', async ({page}) => {
  const email='voicelink-inventory-error@example.test';
  const signup=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite(email)},data:{name:'Inventory Tester',email,password:'fixture-password-123'}});
  expect(signup.ok()).toBeTruthy();
  await page.request.post('/api/onboarding',{headers:{Origin:'http://localhost:3210'},data:{step:'complete',purpose:'personal'}});
  await page.route('**/api/telephony/account?provider=voicelink',route=>route.fulfill({json:{account:{status:'active',kycStatus:'verified',callsBlocked:false}}}));
  await page.route('**/api/telephony/voicelink',route=>route.fulfill({json:{configured:true,quote:null,blockers:[]}}));
  await page.route('**/api/telephony/voicelink/checkout',route=>route.fulfill({json:{checkout:{id:'fixture',e164:'+918012345678',state:'draft_unknown',confirmationAvailable:false,recoveryMessage:'Your operator must locate the original draft.',quote:null,terms:null,customerPrice:null}}}));
  await page.route('**/api/telephony/voicelink/inventory',route=>route.fulfill({status:400,json:{error:'Invalid phone number'}}));
  await page.setViewportSize({width:320,height:700});await page.goto('/dashboard/phone?provider=voicelink');
  await page.getByRole('button',{name:'Browse VoiceLink numbers'}).click();
  await expect(page.getByText('Invalid phone number',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'VoiceLink setup'})).toBeVisible();
  await expect(page.getByText('Checkout status: draft unknown')).toBeVisible();
  await expect(page.getByRole('button',{name:'Purchase and assign number'})).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:'.test-output/voicelink-recovery-320.png',fullPage:true});
});
