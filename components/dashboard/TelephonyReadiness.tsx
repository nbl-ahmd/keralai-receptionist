"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Notice} from '@/components/ui/notice';
import {phoneApi} from '@/lib/telephony/client-ui';
interface Readiness {
 release:{commit:string|null};checks:Array<{key:string;label:string;ready:boolean}>;
 bridge:{status:string;commit:string|null;phoneSetupVersion:number|null};note:string;
}
export default function TelephonyReadiness({tenantId}:{tenantId?:string}) {
 const [data,setData]=useState<Readiness|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{
  setBusy(true);setError('');
  try{setData(await phoneApi('/api/admin/telephony/readiness?probeBridge=1'+(tenantId?`&tenantId=${encodeURIComponent(tenantId)}`:'')));}
  catch(error){setError(error instanceof Error?error.message:'Checks unavailable.');}finally{setBusy(false);}
 };
 return <section className="my-5 rounded-lg border border-border p-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{tenantId?'Workspace phone checks':'Phone service checks'}</h2>
   <Button size="sm" variant="outline" loading={busy} onClick={()=>void load()}>Check readiness</Button></div>
  {error&&<Notice tone="error" className="mt-3">{error}</Notice>}
  {data&&<><ul className="mt-3 space-y-2 text-sm">{data.checks.map(check=><li key={check.key}>{check.ready?'✓':'Needs attention:'} {check.label}</li>)}</ul>
   <p className="mt-3 break-all text-xs text-muted-foreground">App version: {data.release.commit?.slice(0,12)??'unavailable'} · Bridge: {data.bridge.status} · Version: {data.bridge.commit?.slice(0,12)??'unavailable'}</p>
   {data.bridge.status==='reachable'&&data.bridge.phoneSetupVersion!==1&&<Notice tone="warning" className="mt-3">The bridge does not report the current phone setup version. Check its deployment before retesting browser voice.</Notice>}
   {data.release.commit&&data.bridge.commit&&data.release.commit!==data.bridge.commit&&<Notice tone="warning" className="mt-3">The app and bridge report different commits. Check both deployments.</Notice>}
   <p className="mt-3 text-xs text-muted-foreground">{data.note}</p></>}
 </section>;
}
