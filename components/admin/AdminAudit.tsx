"use client";
import { useCallback,useEffect,useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { phoneApi } from '@/lib/telephony/client-ui';
interface Event {id:string;actor_id:string;tenant_id:string|null;action:string;reason:string;reference:string|null;created_at:string}
export default function AdminAudit(){
 const [items,setItems]=useState<Event[]>([]),[page,setPage]=useState(1),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);try{const data=await phoneApi(`/api/admin/audit?page=${page}`);setItems(data.items);setMore(data.hasMore);setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load history.');}finally{setLoading(false);}},[page]);
 useEffect(()=>{void load();},[load]);
 return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Recorded operator actions. Requested entries can exist without a completed entry when an action failed.</p><Button variant="outline" loading={loading} onClick={()=>void load()}>Refresh</Button></div>{error&&<Notice tone="error">{error}</Notice>}
 <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">{loading&&!items.length?<div className="space-y-3 p-5"><Skeleton className="h-20"/><Skeleton className="h-20"/></div>:!items.length?<p className="p-8 text-sm text-muted-foreground">No operator actions on this page.</p>:<ol className="divide-y divide-slate-100">{items.map(event=><li key={event.id} className="space-y-2 p-5"><div className="flex flex-wrap justify-between gap-2"><p className="break-all text-sm font-semibold">{event.action.replaceAll('_',' ')}</p><time className="text-xs text-muted-foreground" dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></div><p className="text-sm leading-relaxed">{event.reason}</p><p className="break-all text-xs text-muted-foreground">Operator: {event.actor_id} · Workspace: {event.tenant_id??'Platform'}{event.reference?` · Reference: ${event.reference}`:''}</p></li>)}</ol>}</section>
 <div className="flex items-center justify-between"><Button variant="ghost" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm text-muted-foreground">Page {page}</span><Button variant="ghost" disabled={!more||loading} onClick={()=>setPage(p=>p+1)}>Next</Button></div></div>;
}
