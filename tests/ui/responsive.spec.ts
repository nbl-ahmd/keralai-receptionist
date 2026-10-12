import {fixtureInvite} from './invite-fixture';
import {test,expect} from '@playwright/test';
const sizes=[[320,568],[360,800],[375,812],[390,844],[414,896],[768,1024],[1024,768],[1280,800],[1440,900],[1728,1117]];
const summary={account:null,numbers:[],wallet:{balanceMinor:0,heldMinor:0,availableMinor:0,status:'active'},phoneCallsReady:false,phoneReadinessReason:'Phone service is awaiting provider readiness.',configured:true,kycAvailable:true,browserTestCompleted:true,phoneActivationApproved:true,assistantConfigured:true,paymentsEnabled:false};
test('signup resumes onboarding; managed pages fit all acceptance viewports',async({page})=>{
 test.setTimeout(600000); // Fifty real authenticated page loads against the remote fixture DB.
 const registration=await page.request.post('/api/auth/sign-up/email',{data:{name:'Responsive Test',email:'responsive@example.test',password:'browser-test-password123'},headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite('responsive@example.test')}});expect(registration.ok()).toBeTruthy();
 await page.goto('/dashboard');await expect(page).toHaveURL(/onboarding/);
 await page.setViewportSize({width:320,height:568});await expect(page.getByRole('heading',{name:'What can we take off your hands?'})).toBeVisible();
 await page.screenshot({path:'.test-output/onboarding-320.png',fullPage:true});
 await page.request.post('/api/onboarding',{data:{purpose:'personal',step:'complete',profile:{name:'Asha',assistantName:'Maya',assistantLanguage:'English',description:'Personal assistant',assistantInstructions:''}},headers:{Origin:'http://localhost:3210'}});
 await page.route('**/api/telephony/account',route=>route.fulfill({json:summary}));
 for(const [width,height] of sizes){
  await page.setViewportSize({width,height});
  for(const path of ['/dashboard/phone','/dashboard/assistant','/dashboard/settings','/dashboard/billing','/dashboard#calls']){
   await page.goto(path);await expect(page).not.toHaveURL(/onboarding/);await expect(page.locator('main')).toBeVisible();await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
   await page.waitForLoadState('networkidle');
   const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:window.innerWidth}));expect(dimensions.scroll,`${path} at ${width}px`).toBeLessThanOrEqual(dimensions.width);
   await page.screenshot({path:`.test-output/${path.split('/').at(-1)!.replace('#','-')}-${width}.png`,fullPage:true});
  }
 }
});
test('phone verification, failed setup, active and error states remain usable on mobile',async({page})=>{
 const signup=await page.request.post('/api/auth/sign-up/email',{data:{name:'Phone state tester',email:'phone-state-ui@example.test',password:'browser-test-password123'},headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite('phone-state-ui@example.test')}});
 expect(signup.ok()).toBeTruthy();
 await page.request.post('/api/onboarding',{data:{purpose:'personal',step:'complete'},headers:{Origin:'http://localhost:3210'}});
 await page.setViewportSize({width:320,height:568});
 const account={kycStatus:'pending',callsBlocked:true,documents:{pan:'verified',aadhaar:'pending'},status:'active',sessionStatus:'expired',sessionExpiresAt:new Date(Date.now()-10000).toISOString(),lastCheckedAt:null};
 let state:any={...summary,account};
 await page.route('**/api/telephony/account',r=>r.fulfill({json:state}));
 for(const mode of ['pending','failed','active','error']){
  if(mode==='failed')state={...summary,account:{...account,kycStatus:'verified',callsBlocked:false},numbers:[{id:'number',e164:'+914841234501',region:'Kerala',status:'failed',provisioningStatus:'configuration_failed',monthlyPriceMinor:10000}]};
  if(mode==='active')state={...state,numbers:[{...state.numbers[0],status:'active',provisioningStatus:'active'}]};
  if(mode==='error'){await page.unroute('**/api/telephony/account');await page.route('**/api/telephony/account',r=>r.fulfill({status:503,json:{error:'Unable to load phone setup. Try again.'}}));}
  await page.goto('/dashboard/phone');await page.waitForLoadState('networkidle');
  if(mode==='active')await expect(page.getByText('Paused — Phone service is awaiting provider readiness.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:`.test-output/phone-${mode}-320.png`,fullPage:true});
 }
});
test('mobile inventory and activation dialog support keyboard dismissal',async({page})=>{
 await page.request.post('/api/auth/sign-up/email',{data:{name:'Independent UI Tester',email:'dialog@example.test',password:'browser-test-password123'},headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite('dialog@example.test')}});
 await page.request.post('/api/onboarding',{data:{purpose:'personal',step:'complete'},headers:{Origin:'http://localhost:3210'}});
 await page.setViewportSize({width:320,height:568});
 await page.route('**/api/telephony/account',r=>r.fulfill({json:{...summary,wallet:{...summary.wallet,balanceMinor:12000,availableMinor:12000},account:{kycStatus:'verified',callsBlocked:false,documents:{pan:'verified',aadhaar:'verified'},status:'active',sessionStatus:'kyc_completed',sessionExpiresAt:null,lastCheckedAt:null}}}));
 await page.route('**/api/telephony/numbers/search?*',r=>r.fulfill({json:{items:[{e164:'+914841234501',region:'Kerala',monthlyPriceMinor:10000,setupPriceMinor:1000}],page:1,total:1}}));
 await page.goto('/dashboard/phone');await page.getByRole('button',{name:'Find numbers'}).click();await page.getByRole('button',{name:'Choose',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('button',{name:'Activate number',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Activate number',exact:true})).toBeInViewport();
 await page.getByRole('dialog').evaluate(async element=>{await Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished));});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:'.test-output/phone-activation-dialog-320.png',fullPage:false});
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();await expect(page.getByRole('button',{name:'Choose',exact:true})).toBeFocused();
});

test('managed alpha AI hides personal-key setup on narrow screens',async({page})=>{
 await page.request.post('/api/auth/sign-up/email',{data:{name:'Independent UI Tester',email:'managed-alpha@example.test',password:'browser-test-password123'},headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite('managed-alpha@example.test')}});
 await page.request.post('/api/onboarding',{data:{purpose:'personal',step:'complete'},headers:{Origin:'http://localhost:3210'}});
 await page.route('**/api/tenant/secrets',r=>r.fulfill({json:{secrets:[],ai:{mode:'platform',configured:true}}}));
 await page.setViewportSize({width:320,height:568});
 await page.goto('/dashboard/advanced');
 await expect(page.getByText('AI access is included for invited testers. Daily testing allowances apply.')).toBeVisible();
 await expect(page.getByLabel('Gemini API key')).toHaveCount(0);
 await expect(page.getByLabel('Text model',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:'.test-output/managed-alpha-320.png',fullPage:true});
});
