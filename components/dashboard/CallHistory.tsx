"use client";
import { useEffect,useState } from 'react';
import CallsSection from './CallsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import type { CallRecord, Appointment } from '@/types';
export default function CallHistory({initialSelectedId,appointments}:{initialSelectedId:string|null;appointments:Appointment[]}){
 const [calls,setCalls]=useState<CallRecord[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [selected,setSelected]=useState<CallRecord|null>(null),[search,setSearch]=useState(''),[term,setTerm]=useState(''),[date,setDate]=useState(''),[channel,setChannel]=useState('all'),[outcome,setOutcome]=useState<'all'|CallRecord['outcome']>('all');
 useEffect(()=>{const timer=setTimeout(()=>{setTerm(search);setPage(1);},300);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);const p=new URLSearchParams({paginated:'1',page:String(page),search:term,date,channel,outcome});
 void fetch(`/api/calls?${p}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setCalls(d.items);setTotal(d.total);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(e.message||'Could not load calls.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[page,term,date,channel,outcome]);
 useEffect(()=>{if(!initialSelectedId)return;let cancelled=false;void fetch(`/api/calls?id=${encodeURIComponent(initialSelectedId)}`,{cache:'no-store'}).then(async r=>{if(r.ok){const d=await r.json();if(!cancelled)setSelected(d);}}).catch(()=>setError('Could not load the conversation.'));return()=>{cancelled=true;};},[initialSelectedId]);
 return <div className="space-y-5">{error&&<Notice tone="error">{error}</Notice>}
  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_140px]"><Field label="Search calls">{props=><Input {...props} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Caller or phone number"/>}</Field><Field label="Date">{props=><Input {...props} type="date" value={date} onChange={e=>{setDate(e.target.value);setPage(1);}}/>}</Field><Field label="Channel">{props=><select {...props} value={channel} onChange={e=>{setChannel(e.target.value);setPage(1);}} className="min-h-11 rounded-lg border border-input bg-background px-3"><option value="all">All channels</option><option value="phone">Phone</option><option value="web">Browser</option></select>}</Field></div>
  <CallsSection filteredCalls={calls} callFilter={outcome} onFilterChange={value=>{setOutcome(value);setPage(1);}} selectedCall={selected} callBookings={selected?appointments.filter(a=>selected.bookingIds.includes(a.id)||a.callSid===selected.callSid):[]} loading={loading} onSelectCall={id=>setSelected(calls.find(c=>c.id===id)??null)} onCloseDetail={()=>setSelected(null)}/>
  <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-xs text-muted-foreground">Page {page} · {total} calls</span><Button variant="outline" disabled={page*25>=total||loading} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
 </div>;
}
