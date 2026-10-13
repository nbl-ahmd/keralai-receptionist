import { test, expect } from './fixtures';
import { fixtureInvite, loginOperator } from './invite-fixture';

test('admin is protected server-side and an ordinary workspace cannot read operator data', async ({page}) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/login/);
  const email='non-operator-admin-ui@example.test';
  const response=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite(email)},data:{name:'Ordinary owner',email,password:'fixture-password-123'}});
  expect(response.ok()).toBeTruthy();
  await page.request.post('/api/onboarding',{headers:{Origin:'http://localhost:3210'},data:{step:'complete',purpose:'personal'}});
  expect((await page.request.get('/api/admin/audit')).status()).toBe(403);
  const denied=await page.goto('/admin/workspaces');
  expect([200,404]).toContain(denied?.status());
  await expect(page.getByText('This page could not be found.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Workspaces',exact:true})).toHaveCount(0);
  await page.goto('/dashboard/phone');
  await expect(page.getByRole('link',{name:/Administration/})).toHaveCount(0);
  await page.setViewportSize({width:1280,height:850});
  await page.getByRole('link',{name:/Knowledge/}).click();
  await expect(page).toHaveURL(/dashboard#knowledge/);
  await expect(page.getByRole('heading',{name:'Knowledge',exact:true,level:1})).toBeVisible();
});

test('operator navigation, legacy redirect and admin sections work at mobile and desktop sizes', async ({page}) => {
  await loginOperator(page);
  await page.request.post('/api/onboarding',{headers:{Origin:'http://localhost:3210'},data:{step:'complete',purpose:'personal'}});
  await page.goto('/dashboard/phone');
  await page.getByRole('link',{name:/Administration/}).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await page.goto('/dashboard/admin');
  await expect(page).toHaveURL(/\/admin$/);
  for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:850});
    for(const path of ['/admin','/admin/workspaces','/admin/operations','/admin/providers','/admin/audit']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      const overflow=await page.evaluate(()=>({width:window.innerWidth,document:document.documentElement.scrollWidth,items:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>window.innerWidth+1).filter(el=>!el.parentElement?.closest('.overflow-x-auto, .overflow-hidden')).slice(0,20).map(el=>({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right}))}));
      expect(overflow.document,JSON.stringify({path,...overflow})).toBeLessThanOrEqual(width);
    }
    await page.goto('/admin');
    await expect(page.getByText('No pending call settlements reported.')).toBeVisible();
    await page.screenshot({path:`.test-output/admin-overview-${width}.png`,fullPage:true});
  }
  await page.goto('/admin/workspaces');
  await page.getByRole('button',{name:/Manage Platform operator/}).click();
  const panel=page.getByRole('dialog',{name:'Platform operator',exact:true});
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button',{name:'Grant app credit',exact:true})).toBeDisabled();
  await panel.getByLabel('Operator reason').fill('UI fixture review');
  await panel.getByRole('button',{name:'Grant app credit',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Grant app credit',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Grant app credit',exact:true})).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('email login opens the requested admin page with fresh server authorization', async ({page}) => {
  await page.goto('/login?next=%2Fadmin');
  await page.getByLabel('Email',{exact:true}).fill('platform-operator@example.test');
  await page.getByLabel('Password',{exact:true}).fill('fixture-operator-password-123');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading',{name:'Overview',exact:true,level:1})).toBeVisible();
});
