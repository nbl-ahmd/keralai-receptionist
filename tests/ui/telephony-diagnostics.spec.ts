import {test,expect} from './fixtures';
import {fixtureInvite} from './invite-fixture';

test('phone inventory explains reviewed numbers and retains provider pagination',async({page})=>{
 const email='inventory-review-ui@example.test';
 const signup=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite(email)},data:{name:'Inventory Review',email,password:'fixture-password-123'}});
 expect(signup.ok()).toBeTruthy();
 await page.request.post('/api/onboarding',{headers:{Origin:'http://localhost:3210'},data:{step:'complete',purpose:'personal'}});
 await page.route('**/api/telephony/account',r=>r.fulfill({json:{
  account:{status:'active',kycStatus:'verified',callsBlocked:false,documents:{}},numbers:[],
  wallet:{status:'active',availableMinor:25000,heldMinor:0,balanceMinor:25000},
  phoneActivationApproved:true,browserTestCompleted:true,kycAvailable:true,configured:true,assistantConfigured:true,paymentsEnabled:false,
 }}));
 await page.route('**/api/telephony/numbers/search?**',r=>r.fulfill({json:{
  items:[],page:1,total:50,hasMore:true,excluded:{metadata:0,pricing:0,exposure:25},
 }}));
 await page.setViewportSize({width:320,height:568});
 await page.goto('/dashboard/phone');
 await page.getByRole('button',{name:'Find numbers',exact:true}).click();
 await expect(page.getByText('25 numbers need operator review',{exact:false})).toBeVisible();
 await expect(page.getByText('No numbers on this page meet the approved phone policy.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Next',exact:true})).toBeEnabled();
 await expect(page.getByText('No numbers matched.',{exact:false})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});

test('admin readiness exposes blockers and deployment mismatch on a narrow screen',async({page})=>{
 const email='readiness-ui@example.test';
 const signup=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite(email)},data:{name:'Readiness UI',email,password:'fixture-password-123'}});
 expect(signup.ok()).toBeTruthy();
 await page.request.post('/api/onboarding',{headers:{Origin:'http://localhost:3210'},data:{step:'complete',purpose:'personal'}});
 await page.route('**/api/admin/telephony?page=*',r=>r.fulfill({json:{items:[],page:1}}));
 await page.route('**/api/admin/alpha',r=>r.fulfill({json:{tenants:[],invites:[],controls:{},metrics:{}}}));
 await page.route('**/api/admin/telephony/readiness?**',r=>r.fulfill({json:{
  release:{commit:'0123456789abcdef'},bridge:{status:'reachable',commit:'abcdef0123456789',phoneSetupVersion:1},
  checks:[{key:'migration016',label:'Migration 016 schema changes present',ready:true},{key:'policy',label:'Approved DID pricing and funding policy configured',ready:false}],
  note:'Configuration and stored state only. Live provider acceptance requires separate verification.',
 }}));
 await page.setViewportSize({width:320,height:568});
 await page.goto('/dashboard/admin');
 await page.getByRole('button',{name:'Check readiness',exact:true}).click();
 await expect(page.getByText('Needs attention: Approved DID pricing and funding policy configured')).toBeVisible();
 await expect(page.getByText('The app and bridge report different commits.',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:'.test-output/telephony-readiness-320.png',fullPage:true});
});
