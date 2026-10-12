"use client";
import AlphaUsageCard from '@/components/dashboard/AlphaUsageCard';
import { useEffect,useState } from 'react';
import AppShell from '@/components/app/AppShell';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { money,phoneApi } from '@/lib/telephony/client-ui';
interface Data {wallet:{balanceMinor:number;heldMinor:number;availableMinor:number};transactions:Array<{id:string;type:string;amount_minor:string;created_at:string}>}
export default function BillingPage(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState('');
 useEffect(()=>{void phoneApi('/api/wallet').then(setData).catch(e=>setError(e.message));},[]);
 return <AppShell title="Balance & usage" description="Your KeralAI credits and account activity." activeRoute="billing" routeMode contentWidth="narrow">
  <AlphaUsageCard/>
  {error&&<Notice tone="error">{error}</Notice>}
  {!data?<Skeleton className="h-48"/>:<div className="space-y-8"><section className="border-b border-border pb-7"><p className="text-sm text-muted-foreground">Available testing credit</p><h2 className="mt-2 font-display text-4xl font-semibold tabular-nums">{money(data.wallet.availableMinor)}</h2><p className="mt-3 text-sm text-muted-foreground">{money(data.wallet.heldMinor)} reserved · {money(data.wallet.balanceMinor)} account balance</p></section>
  <Notice tone="info">KeralAI sponsors closed Alpha testing. No customer payment is required; testers never pay Vobiz directly. Testing credit has no cash or withdrawal value. Contact your organiser for more credit.</Notice>
  <section><h2 className="mb-4 font-display text-xl font-semibold">Account activity</h2>{!data.transactions.length?<p className="border-y border-border py-8 text-sm text-muted-foreground">No transactions yet. Credits and confirmed phone charges will appear here.</p>:<ul className="divide-y divide-border">{data.transactions.map(tx=><li key={tx.id} className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-medium capitalize">{tx.type.replaceAll('_',' ')}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString('en-IN')}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{Number(tx.amount_minor)>0?'+':''}{money(Number(tx.amount_minor))}</p></li>)}</ul>}</section></div>}
 </AppShell>;
}
