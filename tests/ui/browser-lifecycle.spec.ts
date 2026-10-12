import {test,expect} from './fixtures';
import {fixtureInvite} from './invite-fixture';
test.use({permissions:['microphone'],launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}});
test('closing voice modal stops microphone tracks and sends relay stop',async({page})=>{
 const origin='http://localhost:3210',email='browser-lifecycle@example.test';
 const signup=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin,'x-alpha-invite-code':await fixtureInvite(email)},data:{name:'Voice lifecycle',email,password:'fixture-password-123'}});
 expect(signup.ok()).toBeTruthy();
 await page.request.post('/api/onboarding',{headers:{Origin:origin},data:{step:'test',purpose:'personal'}});
 await page.addInitScript(()=>{
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  (window as any).fixtureTracks=[];
  navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);(window as any).fixtureTracks.push(...stream.getTracks());return stream;};
 });
 await page.route('**/api/voice/token',route=>route.fulfill({json:{token:'fixture-token',wsUrl:'ws://localhost:3210/ws/browser'}}));
 let stopped=false;
 await page.routeWebSocket('**/ws/browser?*',ws=>{
  ws.onMessage(raw=>{const frame=JSON.parse(String(raw));if(frame.type==='start')ws.send(JSON.stringify({type:'connected'}));if(frame.type==='stop')stopped=true;});
 });
 await page.goto('/dashboard/onboarding');await page.getByRole('button',{name:'Test assistant',exact:true}).click();
 await expect(page.getByRole('button',{name:'End session',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close live session'}).click();
 await expect.poll(()=>stopped).toBe(true);
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureTracks.length>0&&(window as any).fixtureTracks.every((track:MediaStreamTrack)=>track.readyState==='ended'))).toBe(true);
});
