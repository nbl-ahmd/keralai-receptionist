import { test, expect } from './fixtures';
import { fixtureInvite } from './invite-fixture';

test('dashboard polls activity without reloading configuration and pauses in hidden tabs', async ({page}) => {
  const email='snapshot-performance@example.test';
  expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite(email)},data:{name:'Snapshot tester',email,password:'fixture-password-123'}})).ok()).toBeTruthy();
  await page.request.post('/api/onboarding',{headers:{Origin:'http://localhost:3210'},data:{step:'complete',purpose:'personal'}});
  let full=0,activity=0;
  await page.route('**/api/dashboard*',async route=>{
    const partial=new URL(route.request().url()).searchParams.get('scope')==='activity';
    if(partial)activity++;else full++;
    await route.fulfill({json:{appointments:[],calls:[],inbox:{appointments:[],callbacks:[],quotes:[],messages:[]},
      ...(partial?{}:{profile:{name:'Snapshot tester'},knowledge:[],contacts:[],settings:{crm:null,booking:null}})}});
  });
  await page.clock.install();
  await page.goto('/dashboard');
  await expect.poll(()=>full).toBe(1);
  await expect.poll(()=>activity).toBe(1);
  await page.clock.runFor(21000);
  await expect.poll(()=>activity).toBe(3);
  expect(full).toBe(1);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(21000);
  expect(activity).toBe(3);expect(full).toBe(1);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>activity).toBe(5);
  expect(full).toBe(1);
});
