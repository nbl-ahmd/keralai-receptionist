import {test,expect} from './fixtures';
import {fixtureInvite} from './invite-fixture';

for(const accountType of ['individual','business'])test(`managed ${accountType} verification stays in the app and returns from DigiLocker`,async({page})=>{
 const email=`managed-kyc-${accountType}@example.test`;
 expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:'http://localhost:3210','x-alpha-invite-code':await fixtureInvite(email)},data:{name:'Managed Tester',email,password:'fixture-password-123'}})).ok()).toBeTruthy();
 await page.request.post('/api/onboarding',{headers:{Origin:'http://localhost:3210'},data:{step:'complete',purpose:'personal'}});
 let state={termsUrl:'https://app.voicelink.co.in/fixture-terms',status:'pending',accountType,step:'register',readyForSubmission:false,finalSubmissionAvailable:true,documents:{pan:{verified:false,uploaded:false},aadhaar:{verified:false,uploaded:false},gst:{verified:false,uploaded:false}}};
 await page.route('**/api/telephony/account?provider=voicelink',r=>r.fulfill({json:{account:{status:'active',kycStatus:state.status,callsBlocked:state.status!=='verified'},phoneActivationApproved:true,browserTestCompleted:true}}));
 await page.route('**/api/telephony/voicelink',r=>r.fulfill({json:{configured:true,accountCreationAvailable:false,currentPlan:{availableChannels:0},quote:null,blockers:[]}}));
 await page.route('**/api/telephony/voicelink/checkout',r=>r.fulfill({json:{checkout:null}}));
 await page.route('**/api/telephony/kyc?provider=voicelink',r=>r.fulfill({json:{ok:true}}));
 await page.route('**/api/telephony/voicelink/kyc',async r=>{
  if(r.request().method()==='POST'){
   const body=r.request().postDataJSON();expect(body.client_id).toBeUndefined();expect(body.tenantId).toBeUndefined();
   if(body.action==='register')state={...state,accountType:body.accountType,step:'pan'};
   if(body.action==='pan')state.documents.pan.verified=true;
   if(body.action==='gst')state.documents.gst.verified=true;
   if(body.action==='submit')state.status='verified';
   if(body.action==='aadhaar')return r.fulfill({json:{redirectUrl:'https://digilocker.gov.in/fixture'}});
  }
  await r.fulfill({json:state});
 });
 await page.route('**/api/telephony/voicelink/kyc/upload',async r=>{
  const content=r.request().postData()??'';const type=content.includes('\r\npan\r\n')?'pan':content.includes('\r\naadhaar\r\n')?'aadhaar':'gst';
  state.documents[type].uploaded=true;state.readyForSubmission=state.documents.pan.uploaded&&state.documents.aadhaar.uploaded&&(state.accountType==='individual'||state.documents.gst.uploaded);
  await r.fulfill({json:state});
 });
 await page.route('https://digilocker.gov.in/fixture',r=>r.fulfill({contentType:'text/html',body:'<a href="http://localhost:3210/api/telephony/voicelink/kyc/return?status=verified">Return to setup</a>'}));
 await page.setViewportSize({width:390,height:844});await page.goto('/dashboard/phone?provider=voicelink');
 await expect(page.getByText('register separately',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Open VoiceLink verification'})).toHaveCount(0);
 await expect(page.getByText('unallocated channels',{exact:false})).toHaveCount(0);
 await page.getByLabel('Account type',{exact:true}).selectOption(accountType);
 for(const [label,value] of [['Full legal name','Fixture Person'],['Contact number (+91)','+919876543210'],['Billing address','Synthetic test address'],['State','Kerala'],['City','Kochi'],['Postal code','682001']])await page.getByLabel(label,{exact:true}).fill(value);
 if(accountType==='business')await page.getByLabel('Business name',{exact:true}).fill('Fixture business');
 await expect(page.getByRole('button',{name:'Save verification details'})).toBeDisabled();
 await page.getByRole('checkbox',{name:/reviewed and accept/}).check();await page.getByRole('button',{name:'Save verification details'}).click();
 await page.getByLabel('Name on PAN',{exact:true}).fill('Fixture Person');await page.getByLabel('PAN number',{exact:true}).fill('ABCDE1234F');await page.getByRole('button',{name:'Verify PAN',exact:true}).click();
 const file={name:'fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nsynthetic document')};
 await page.getByLabel('Upload PAN document',{exact:true}).setInputFiles(file);
 await page.getByRole('button',{name:'Continue with DigiLocker'}).click();await expect(page).toHaveURL('https://digilocker.gov.in/fixture');
 state.documents.aadhaar.verified=true;await page.getByRole('link',{name:'Return to setup'}).click();await expect(page).toHaveURL(/dashboard\/phone\?provider=voicelink$/);
 await page.getByLabel('Upload Aadhaar document',{exact:true}).setInputFiles(file);
 if(accountType==='business'){await page.getByLabel('GSTIN',{exact:true}).fill('22AAAAA0000A1Z5');await page.getByRole('button',{name:'Verify GSTIN'}).click();await page.getByLabel('Upload GST certificate',{exact:true}).setInputFiles(file);}
 await page.getByRole('button',{name:'Submit verification',exact:true}).click();
 await expect(page.getByText('Identity verified. You can continue to choose your number.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:`.test-output/voicelink-managed-${accountType}-390.png`,fullPage:true});
});
