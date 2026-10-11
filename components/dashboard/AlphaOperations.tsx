"use client";
import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Field} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Notice} from '@/components/ui/notice';
import {phoneApi,money} from '@/lib/telephony/client-ui';
interface Tenant {id:string;name:string;status:string;plan_code:string;subscription_status:string;voice_enabled:boolean;purchase_enabled:boolean;balance_minor:string;phone_seconds:string;pending_cdr:number;active_sessions:number;entitlements:{phone_minutes:number};entitlement_overrides:{phone_minutes?:number}}
interface Invite {id:string;email:string|null;uses:number;max_uses:number;status:string;expires_at:string}
interface Snapshot {tenants:Tenant[];invites:Invite[];controls:{browser_enabled:boolean;phone_enabled:boolean;purchase_enabled:boolean};metrics:{active_browser:number;active_phone:number;today_seconds:string;provider_actual_minor:string;ai_estimated_minor:string;pending_settlements:number;oldest_pending_seconds:number;request_ai_estimated_minor:string;today_ai_requests:number}}
export default function AlphaOperations(){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[page,setPage]=useState(1);
 const [email,setEmail]=useState(''),[reason,setReason]=useState(''),[reference,setReference]=useState(''),[inviteUrl,setInviteUrl]=useState('');
 const [selected,setSelected]=useState(''),[credit,setCredit]=useState(''),[minutes,setMinutes]=useState('');
 const load=useCallback(async()=>{try{setData(await phoneApi(`/api/admin/alpha?page=${page}`));}catch(e){setError(e instanceof Error?e.message:'Unable to load alpha controls.');}},[page]);
 useEffect(()=>{void load();},[load]);
 const act=async(action:string,extra:Record<string,unknown>={})=>{
  setBusy(true);setError('');try{
   const result=await phoneApi('/api/admin/alpha',{action,reason,reference:reference||crypto.randomUUID(),...extra});
   if(result.token)setInviteUrl(`${window.location.origin}/register?invite=${encodeURIComponent(result.token)}`);
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Operator action failed.');}finally{setBusy(false);}
 };
 return <section className="mb-10 space-y-6 border-b border-border pb-8" aria-label="Alpha operations">
  <h2 className="font-display text-2xl font-semibold">Closed alpha operations</h2>
  {error&&<Notice tone="error">{error}</Notice>}
  {data&&<><div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3"><p>{data.metrics.active_browser} browser sessions</p><p>{data.metrics.active_phone} phone calls</p><p>{Math.ceil(Number(data.metrics.today_seconds)/60)} minutes today</p><p>{money(Number(data.metrics.provider_actual_minor))} carrier cost this month</p><p>{money(Number(data.metrics.ai_estimated_minor)+Number(data.metrics.request_ai_estimated_minor))} reserved AI estimate</p><p>{data.metrics.pending_settlements} pending settlements ({Math.ceil(data.metrics.oldest_pending_seconds/60)} min oldest)</p><p>{data.metrics.today_ai_requests} AI requests today</p></div>
   <div className="flex flex-wrap gap-2">{([['browser_enabled','Browser voice'],['phone_enabled','New phone calls'],['purchase_enabled','Number purchases']] as const).map(([key,label])=><Button key={key} variant="outline" disabled={busy||!reason.trim()} onClick={()=>void act('platform_controls',{value:{[key]:!data.controls[key]}})}>{data.controls[key]?'Pause':'Enable'} {label}</Button>)}</div>
   <p className="text-xs text-muted-foreground">Provider signature readiness remains a separate server attestation. These controls do not enable it.</p>
  </>}
  <div className="grid gap-4 sm:grid-cols-2"><Field label="Operator reason" hint="Required for every action.">{props=><Input {...props} value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/>}</Field><Field label="Operation reference" hint="Keep the same reference when retrying a credit.">{props=><Input {...props} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Unique reference" maxLength={100}/>}</Field></div>
  <div className="space-y-3"><h3 className="font-semibold">Invite a tester</h3><Field label="Invited email" hint="Leave empty only for an unbound, single-use invitation.">{props=><Input {...props} type="email" value={email} onChange={e=>setEmail(e.target.value)}/>}</Field><Button disabled={busy||!reason.trim()} onClick={()=>void act('create_invite',{email,maxUses:1,expiresInDays:7})}>Create invitation</Button>
  {inviteUrl&&<Notice tone="info"><div className="min-w-0"><p className="mb-2">Copy this invitation now. It is shown once and cannot be retrieved after leaving this page.</p><Input aria-label="New invitation link" readOnly value={inviteUrl} onFocus={e=>e.target.select()}/><Button variant="ghost" onClick={()=>void navigator.clipboard.writeText(inviteUrl)}>Copy link</Button></div></Notice>}
  </div>
  {data&&<><div className="space-y-3"><h3 className="font-semibold">Tenant controls</h3><label className="block text-sm">Workspace<select className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select a workspace</option>{data.tenants.map(t=><option key={t.id} value={t.id}>{t.name} · {t.plan_code}</option>)}</select></label>
  {data.tenants.filter(t=>t.id===selected).map(t=><div key={t.id} className="space-y-4"><p className="text-sm">{t.status} · {t.subscription_status} · {money(Number(t.balance_minor))} credit · {Math.max(0,(t.entitlement_overrides.phone_minutes??t.entitlements.phone_minutes)-Math.ceil(Number(t.phone_seconds)/60))} phone minutes remaining · {t.active_sessions} active · {t.pending_cdr} CDRs pending</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy||!reason.trim()} onClick={()=>void act(t.status==='suspended'?'resume':'suspend',{tenantId:t.id})}>{t.status==='suspended'?'Resume':'Suspend'} workspace</Button><Button variant="outline" disabled={busy||!reason.trim()} onClick={()=>void act('voice',{tenantId:t.id,value:!t.voice_enabled})}>{t.voice_enabled?'Disable':'Enable'} tenant voice</Button><Button variant="outline" disabled={busy||!reason.trim()} onClick={()=>void act('purchase',{tenantId:t.id,value:!t.purchase_enabled})}>{t.purchase_enabled?'Disable':'Enable'} tenant purchases</Button></div>
  <div className="grid gap-3 sm:grid-cols-2"><Field label="Promotional credit (paise)">{props=><Input {...props} value={credit} inputMode="numeric" onChange={e=>setCredit(e.target.value.replace(/[^0-9]/g,''))}/>}</Field><Field label="Phone minutes per month">{props=><Input {...props} value={minutes} inputMode="numeric" onChange={e=>setMinutes(e.target.value.replace(/[^0-9]/g,''))}/>}</Field></div><div className="flex flex-wrap gap-2"><Button disabled={busy||!reason.trim()||!reference||!credit} onClick={()=>void act('credit',{tenantId:t.id,amountMinor:Number(credit)})}>Grant alpha credit</Button><Button variant="outline" disabled={busy||!reason.trim()||!minutes} onClick={()=>void act('quota',{tenantId:t.id,value:{phone_minutes:Number(minutes)}})}>Update quota</Button></div></div>)}
  </div><div className="flex justify-between"><Button variant="ghost" disabled={page===1||busy} onClick={()=>setPage(p=>p-1)}>Previous tenants</Button><Button variant="ghost" disabled={data.tenants.length<25||busy} onClick={()=>setPage(p=>p+1)}>Next tenants</Button></div>
  <details><summary className="min-h-11 cursor-pointer py-3 text-sm">Recent invitations</summary><ul className="divide-y divide-border">{data.invites.map(i=><li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="break-all">{i.email||'Unbound'} · {i.status} · {i.uses}/{i.max_uses} · {new Date(i.expires_at).toLocaleDateString()}</span><Button size="sm" variant="outline" disabled={busy||i.status!=='active'||!reason.trim()} onClick={()=>void act('revoke_invite',{id:i.id})}>Revoke</Button></li>)}</ul></details></>}
 </section>;
}
