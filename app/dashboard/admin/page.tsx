"use client";
import TelephonyReadiness from '@/components/dashboard/TelephonyReadiness';
import AlphaOperations from '@/components/dashboard/AlphaOperations';
import { useCallback,useEffect,useState } from 'react';
import AppShell from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { phoneApi,money } from '@/lib/telephony/client-ui';
interface Tenant {id:string;name:string;status:string;provider_auth_id:string|null;kyc_status:string|null;kyc_calls_blocked:boolean|null;account_status:string|null;account_error:string|null;number_id:string|null;e164:string|null;number_status:string|null;provisioning_status:string|null;error_code:string|null;balance_minor:string;pending_calls:number;failed_calls:number;recent_usage:Array<{provider_call_id:string;call_status:string;billing_status:string;duration_seconds:number|null}>}
export default function AdminPage(){
 const [items,setItems]=useState<Tenant[]>([]),[page,setPage]=useState(1),[error,setError]=useState(''),[busy,setBusy]=useState(false),[credit,setCredit]=useState<Tenant|null>(null),[amount,setAmount]=useState(''),[reference,setReference]=useState(''),[reason,setReason]=useState('');
 const load=useCallback(async()=>{try{setItems((await phoneApi(`/api/admin/telephony?page=${page}`)).items);setError('');}catch(e){setError(e instanceof Error?e.message:'Could not load tenants.');}},[page]);
 useEffect(()=>{void load();},[load]);
 const act=async(tenant:Tenant,action:string,extra={})=>{setBusy(true);setError('');try{await phoneApi('/api/admin/telephony',{tenantId:tenant.id,numberId:tenant.number_id,action,reason,...extra});await load();setCredit(null);}catch(e){setError(e instanceof Error?e.message:'Operation failed');}finally{setBusy(false);}};
 return <AppShell title="Telephony administration" description="Account gates, provisioning, balance and provider reconciliation." routeMode>
  {error&&<Notice tone="error" className="mb-5">{error}</Notice>}
  <AlphaOperations/>
  <TelephonyReadiness/>
  <Field label="Reason for phone operations" hint="Recorded with each verification, provisioning and credit operation.">{props=><Input {...props} value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/>}</Field>
  <ul className="divide-y divide-border">{items.map(t=><li key={t.id} className="py-6"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold">{t.name}</h2><p className="mt-1 text-xs text-muted-foreground break-all">{t.id} · {t.provider_auth_id??'No phone account'}</p></div><p className="text-sm font-semibold">{money(Number(t.balance_minor))}</p></div><p className="mt-4 text-sm">KYC: {t.kyc_status??'not started'} · Calls {t.kyc_calls_blocked===false?'allowed':'blocked'} · {t.e164??'No number'} · {t.provisioning_status??'No provisioning'}</p><p className="mt-2 text-xs text-muted-foreground">{t.error_code||t.account_error||'No provider errors recorded'} · {t.pending_calls} usage records pending reconciliation · {t.failed_calls} call failures</p><details className="mt-3 text-xs text-muted-foreground"><summary className="min-h-11 cursor-pointer py-3">Recent call states</summary><ul className="space-y-2">{t.recent_usage.map(u=><li key={u.provider_call_id} className="break-all">{u.provider_call_id} · {u.call_status} · {u.billing_status} · {u.duration_seconds??'—'} sec</li>)}</ul></details><TelephonyReadiness tenantId={t.id}/><div className="mt-4 flex flex-wrap gap-2">
   <Button size="sm" variant="outline" disabled={busy||!t.provider_auth_id} onClick={()=>void act(t,'sync_kyc')}>Sync verification</Button>
   {t.number_id&&<><Button size="sm" variant="outline" disabled={busy} onClick={()=>void act(t,'retry_number')}>Retry setup</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void act(t,t.number_status==='suspended'?'resume_number':'suspend_number')}>{t.number_status==='suspended'?'Resume':'Suspend'}</Button></>}
   <Button size="sm" variant="outline" disabled={busy} onClick={()=>{setCredit(t);setAmount('');setReference(crypto.randomUUID());}}>Grant beta credit</Button>
  </div></li>)}</ul><div className="mt-6 flex justify-between"><Button variant="ghost" disabled={page===1||busy} onClick={()=>setPage(p=>p-1)}>Previous</Button><Button variant="ghost" disabled={items.length<25||busy} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
  <Dialog open={!!credit} onOpenChange={open=>{if(!open&&!busy)setCredit(null);}} title="Grant beta account credit" description="An audited account adjustment. This does not represent a payment." size="sm" footer={<><Button variant="outline" disabled={busy} onClick={()=>setCredit(null)}>Cancel</Button><Button loading={busy} onClick={()=>void act(credit!,'credit',{amountMinor:Number(amount),reference})}>Record credit</Button></>}>
   <div className="space-y-4"><Field label="Amount in paise" hint="100 paise = ₹1">{props=><Input {...props} value={amount} inputMode="numeric" onChange={e=>setAmount(e.target.value.replace(/[^0-9]/g,''))}/>}</Field><Field label="Credit reference">{props=><Input {...props} value={reference} onChange={e=>setReference(e.target.value)}/>}</Field>{error&&<Notice tone="error">{error}</Notice>}</div>
  </Dialog>
 </AppShell>;
}
