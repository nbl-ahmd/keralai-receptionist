import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(hasActiveWorker:boolean) {
  let activations=0;
  const handlers=new Map<string,(event:Record<string,unknown>)=>void>();
  runInNewContext(source,{URL,self:{registration:{active:hasActiveWorker?{}:null},location:{origin:'https://app.test'},
    skipWaiting:()=>{activations++;},addEventListener:(event:string,handler:(event:Record<string,unknown>)=>void)=>handlers.set(event,handler)}});
  return {handlers,activations:()=>activations};
}
test('first worker installs immediately; updates wait for explicit user activation',()=>{
  const first=worker(false);first.handlers.get('install')!({});assert.equal(first.activations(),1);
  const update=worker(true);update.handlers.get('install')!({});assert.equal(update.activations(),0);
  update.handlers.get('message')!({data:{type:'unrelated'}});assert.equal(update.activations(),0);
  update.handlers.get('message')!({data:{type:'SKIP_WAITING'}});assert.equal(update.activations(),1);
});
test('PWA never intercepts authenticated HTML or API responses',()=>{
  const instance=worker(false);let intercepted=0;
  for(const path of ['/admin','/dashboard','/login','/api/dashboard','/api/admin/audit'])
    instance.handlers.get('fetch')!({request:new Request(`https://app.test${path}`),respondWith:()=>{intercepted++;}});
  assert.equal(intercepted,0);
});
