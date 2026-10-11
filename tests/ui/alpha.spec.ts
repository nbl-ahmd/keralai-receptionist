import {test,expect} from '@playwright/test';
import {fixtureInvite} from './invite-fixture';
test('invitation pages reject expired/reused links and wrong bound email',async({page})=>{
 for(const options of [{expired:true},{consumed:true}]) {
  const token=await fixtureInvite('expired-ui@example.test',options);
  await page.goto(`/register?invite=${token}`);
  await expect(page.getByText('An active invitation from your test organiser is required.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Create workspace'})).toBeDisabled();
 }
 const token=await fixtureInvite('bound-ui@example.test');
 const response=await page.request.post('/api/auth/sign-up/email',{data:{name:'Wrong email',email:'wrong-ui@example.test',password:'ui-fixture-password123'},headers:{Origin:'http://localhost:3210','x-alpha-invite-code':token}});
 expect(response.status()).toBe(403);
});
for(const width of [360,390,414])test(`invited alpha onboarding and usage at ${width}px`,async({page})=>{
 const email=`alpha-mobile-${width}@example.test`,token=await fixtureInvite(email);
 await page.setViewportSize({width,height:844});
 await page.goto(`/register?invite=${token}`);
 await expect(page.getByLabel('Email',{exact:true})).toHaveValue(email);
 await page.getByLabel('Name',{exact:true}).fill('Alpha Mobile');
 await page.getByLabel('Password',{exact:true}).fill('ui-fixture-password123');
 await page.getByLabel('Confirm password').fill('ui-fixture-password123');
 await page.getByRole('button',{name:'Create workspace'}).click();
 await expect(page).toHaveURL(/dashboard\/onboarding/);
 await expect(page.getByRole('heading',{name:'What can we take off your hands?'})).toBeVisible();
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByLabel('Your name',{exact:true}).fill('Alpha Mobile');
 await page.getByLabel('Assistant name',{exact:true}).fill('Test Assistant');
 await page.getByLabel('Preferred language').fill('English');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByLabel('Main instructions').fill('Take messages politely.');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Skip for now'}).click();
 await expect(page.getByRole('button',{name:'Test assistant',exact:true})).toBeVisible();
 await expect(page.getByLabel('Gemini API key')).toHaveCount(0);
 await page.screenshot({path:`.test-output/alpha-browser-before-kyc-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Open dashboard'}).click();
 await expect(page).toHaveURL(/dashboard$/);
 for(const path of ['/dashboard','/dashboard/assistant','/dashboard/phone','/dashboard/billing','/dashboard#calls']) {
  await page.goto(path);await page.waitForLoadState('networkidle');
  await expect(page.locator('main')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`${path} overflow`).toBeTruthy();
  await page.screenshot({path:`.test-output/alpha-${path.split('/').at(-1)!.replace('#','-')}-${width}.png`,fullPage:true});
 }
 await page.goto('/dashboard/billing');await expect(page.getByRole('heading',{name:'Alpha plan'})).toBeVisible();
 await expect(page.getByText('₹250.00').first()).toBeVisible();
});
