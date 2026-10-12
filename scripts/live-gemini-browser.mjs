// Explicitly invoked real-model acceptance. Never imported by CI/unit tests.
import {chromium} from '@playwright/test';
import {Pool} from 'pg';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.env.ALPHA_LIVE_GEMINI_APPROVED,'1');
assert.match(process.env.TEST_SCHEMA??'',/^keralai_test_[a-f0-9]{16}$/);
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const audioFile=process.env.ALPHA_LIVE_AUDIO_FILE;
if(audioFile)assert.ok(existsSync(audioFile),'approved synthetic audio file exists');
const browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required',...(audioFile?[`--use-file-for-fake-audio-capture=${audioFile}`]:[])]});
const origin='http://localhost:3212';
try {
 assert.equal((await pool.query('select current_schema() as schema')).rows[0].schema,process.env.TEST_SCHEMA);
 const results=[];
 for(const [label,language] of [['Cedar','English'],['Lotus','Malayalam']]) {
  const context=await browser.newContext({permissions:['microphone']});
  const page=await context.newPage();
  const token=randomBytes(32).toString('base64url'),email=`live-${label.toLowerCase()}@example.test`;
  await pool.query(`insert into alpha_invites(code_hash,email,created_by,expires_at) values($1,$2,'live-gemini-smoke',now()+interval '1 hour')`,[createHash('sha256').update(token).digest('hex'),email]);
  const signup=await page.request.post(`${origin}/api/auth/sign-up/email`,{headers:{Origin:origin,'x-alpha-invite-code':token},data:{name:label,email,password:randomBytes(24).toString('base64url')}});
  assert.equal(signup.status(),200,'invited signup');
  const setup=await page.request.post(`${origin}/api/onboarding`,{headers:{Origin:origin},data:{step:'test',purpose:'personal',profile:{name:label,assistantName:label,assistantLanguage:language,description:`Private ${label} workspace`,assistantInstructions:`You are ${label}. Greet very briefly in ${language}. Never mention another workspace.`}}});
  assert.equal(setup.status(),200,'assistant setup');
  const day=label==='Cedar'?/Wednesday|ബുധനാഴ്ച/i:/Thursday|വ്യാഴാഴ്ച/i;
  const foreignDay=label==='Cedar'?/Thursday|വ്യാഴാഴ്ച/i:/Wednesday|ബുധനാഴ്ച/i;
  if(audioFile) {
   const knowledge=await page.request.post(`${origin}/api/knowledge`,{headers:{Origin:origin},data:{id:randomUUID(),type:'text',title:'Workshop schedule',content:`The next workshop for ${label} takes place on ${label==='Cedar'?'Wednesday':'Thursday'}.`}});
   assert.equal(knowledge.status(),200,'real knowledge indexing');
   assert.ok((await knowledge.json()).indexed>0,'real embeddings generated');
  }
  const frames=[];
  page.on('websocket',socket=>socket.on('framereceived',event=>{
   try{const f=JSON.parse(String(event.payload));frames.push({type:f.type,role:f.role,text:f.text,bytes:f.data?Buffer.from(f.data,'base64').length:0});}catch{}
  }));
  await page.goto(`${origin}/dashboard/onboarding`);
  await page.getByRole('button',{name:'Test assistant',exact:true}).click();
  const started=Date.now();
  while(Date.now()-started<35000 && !(frames.some(f=>f.type==='audio')&&frames.some(f=>f.type==='transcript'&&f.text)&&(!audioFile||day.test(frames.filter(f=>f.type==='transcript'&&f.role==='assistant').map(f=>f.text??'').join(' ')))))
   await page.waitForTimeout(250);
  await page.getByRole('button',{name:'Close live session'}).click();
  assert.ok(frames.some(f=>f.type==='connected'),`${label}: real Gemini connected`);
  assert.ok(frames.some(f=>f.type==='audio'&&f.bytes>0),`${label}: actual audio received`);
  const transcript=frames.filter(f=>f.type==='transcript').map(f=>f.text??'').join(' ');
  assert.ok(transcript.trim(),`${label}: actual transcript received`);
  assert.ok(!transcript.includes(label==='Cedar'?'Lotus':'Cedar'),'no foreign identity');
  if(language==='Malayalam')assert.match(transcript,/[\u0D00-\u0D7F]/,'Malayalam transcript');
  if(audioFile) {
   console.log(JSON.stringify({check:'synthetic_conversation_evidence',tenant:label,turns:frames.filter(f=>f.type==='transcript').map(f=>({role:f.role,text:f.text}))}));
   const assistant=frames.filter(f=>f.type==='transcript'&&f.role==='assistant').map(f=>f.text??'').join(' ');
   assert.match(assistant,day,`${label}: spoken tenant-specific knowledge response`);
   assert.ok(!foreignDay.test(assistant),'no foreign workshop knowledge');
   assert.ok(frames.some(f=>f.type==='transcript'&&f.role==='caller'&&f.text),'microphone speech transcribed');
  }
  const user=(await pool.query('select id from "user" where email=$1',[email])).rows[0];
  const tid=(await pool.query('select tenant_id from tenant_memberships where user_id=$1',[user.id])).rows[0].tenant_id;
  let sessions=[];
  for(let i=0;i<20;i++) {
   sessions=(await pool.query('select state,settlement,used_seconds from alpha_voice_sessions where tenant_id=$1',[tid])).rows;
   if(sessions.length===1&&sessions[0].settlement==='settled')break;
   await page.waitForTimeout(500);
  }
  assert.equal(sessions.length,1);assert.equal(sessions[0].state,'closed');assert.equal(sessions[0].settlement,'settled');
  assert.equal((await pool.query('select count(*)::int as n from tenant_telephony_accounts where tenant_id=$1',[tid])).rows[0].n,0,'browser before KYC');
  results.push({tenant:label,language,connected:true,audio:true,transcript:true,knowledge:audioFile?'passed':'NOT_RUN',elapsedMs:Date.now()-started,sessionClosed:true,usedSeconds:sessions[0].used_seconds});
  await context.close();
 }
 console.log(JSON.stringify({check:'real_managed_gemini_browser',results,budgetCeilingMinor:50000,actualGoogleCost:'Consult Google billing; estimates are not actual cost',providerMutations:'NOT_RUN',microphone:'synthetic device; human intelligibility acceptance pending'}));
} finally {await browser.close();await pool.end();}
