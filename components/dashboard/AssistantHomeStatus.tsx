"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { Phone,ArrowUpRight } from 'lucide-react';
import { phoneApi,money,type PhoneSummary } from '@/lib/telephony/client-ui';
import type { CompanyProfile } from '@/types';
export default function AssistantHomeStatus({profile}:{profile:CompanyProfile}){
 const [data,setData]=useState<PhoneSummary|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let cancelled=false;void phoneApi('/api/telephony/account').then(d=>{if(!cancelled)setData(d);}).catch(()=>{if(!cancelled)setError(true);});return()=>{cancelled=true;};},[]);
 const number=data?.numbers[0],live=number?.status==='active' && data?.account?.callsBlocked===false && data.assistantConfigured && data.wallet.availableMinor>0;
 return <section className="border-b border-border pb-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm text-muted-foreground">{profile.assistantPurpose==='personal'?'Your personal assistant':'Your receptionist'}</p><h2 className="font-display text-2xl font-semibold tracking-tight">{profile.assistantName||'Your assistant'}{live?' is ready for calls.':' is here to help.'}</h2><p className="mt-2 text-sm text-muted-foreground">{error?'Phone status could not be loaded. Open Phone to try again.':!data?'Checking phone status…':live?`Call ${number?.e164} to reach your assistant.`:number?'Finish phone setup to start taking calls.':'Try a browser conversation, then get a dedicated phone number.'}</p></div><Link href="/dashboard/phone" className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-border bg-card px-4 text-sm font-semibold"><Phone className="h-4 w-4"/>{number?.e164||'Get a number'}<ArrowUpRight className="h-4 w-4"/></Link></div>{data&&<p className="mt-4 text-xs text-muted-foreground">{live?'Incoming calls enabled':'Phone calls not active'} · Available balance {money(data.wallet.availableMinor)}</p>}</section>;
}
