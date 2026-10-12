"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {phoneApi,money} from '@/lib/telephony/client-ui';
import {Notice} from '@/components/ui/notice';
interface Usage {plan:{name:string;code:string;status:string;voiceEnabled:boolean;phoneActivationApproved:boolean;includedMinutes:number;usedMinutes:number;reservedMinutes:number;remainingMinutes:number;browserRemainingSeconds:number;maxConcurrentCalls:number;maxSessionSeconds:number}|null;wallet:{availableMinor:number}}
export default function AlphaUsageCard({compact=false}:{compact?:boolean}) {
 const [data,setData]=useState<Usage|null>(null),[error,setError]=useState('');
 useEffect(()=>{let cancelled=false;void phoneApi('/api/alpha/usage').then(d=>{if(!cancelled)setData(d);}).catch(()=>{if(!cancelled)setError('Usage is temporarily unavailable.');});return()=>{cancelled=true;};},[]);
 if(error)return <p className="my-4 text-sm text-muted-foreground" role="status">{error}</p>;
 if(!data?.plan)return null;
 const p=data.plan,paused=p.status!=='active'||!p.voiceEnabled;
 return <section aria-label="Plan and usage" className="mb-6 rounded-xl border border-border p-4 sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{p.name} plan</h2>{p.code==='alpha'&&<span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">Closed alpha</span>}</div>
  {p.code==='alpha'&&<p className="mt-3 text-sm text-muted-foreground">Sponsored testing credit. No payment is required; testers never pay Vobiz directly. {p.phoneActivationApproved?'Phone activation approved; identity and provider checks still apply.':'Browser testing is available before identity verification. Phone activation needs operator approval.'}</p>}
  <div className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><p className="text-muted-foreground">Phone minutes remaining</p><p className="mt-1 text-xl font-semibold tabular-nums">{p.remainingMinutes}</p></div><div><p className="text-muted-foreground">Available credit</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(data.wallet.availableMinor)}</p></div></div>
  {!compact&&<p className="mt-4 text-sm text-muted-foreground">{p.usedMinutes} of {p.includedMinutes} phone minutes used · {p.maxConcurrentCalls} concurrent phone call{p.maxConcurrentCalls===1?'':'s'} · {Math.floor(p.browserRemainingSeconds/60)} browser minutes remaining · Up to {Math.floor(p.maxSessionSeconds/60)} minutes per session</p>}
  {p.reservedMinutes>0&&<p className="mt-3 text-xs text-muted-foreground">{p.reservedMinutes} minutes reserved for active calls or calls awaiting final confirmation.</p>}
  {(paused||p.remainingMinutes===0||data.wallet.availableMinor<=0)&&<Notice tone="info" className="mt-4">{paused?'Voice is paused for this workspace.':'Phone calling is paused until your organiser reviews your allowance or credit.'} Your assistant settings remain available. Contact your alpha organiser for help.</Notice>}
  {compact&&<Link href="/dashboard/billing" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">View usage</Link>}
 </section>;
}
