"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import { Notice } from '@/components/ui/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { signOut } from '@/lib/auth/client';
export default function SettingsPage(){
 const router=useRouter();
 const [name,setName]=useState(''),[role,setRole]=useState(''),[error,setError]=useState(''),[state,setState]=useState('');
 useEffect(()=>{void fetch('/api/tenant',{cache:'no-store'}).then(r=>r.json()).then(d=>{setName(d.tenant?.name??'');setRole(d.role??'');}).catch(()=>setError('Could not load account settings.'));},[]);
 const save=async()=>{setState('Saving…');try{const r=await fetch('/api/tenant',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});if(!r.ok)throw new Error();setState('Saved');}catch{setState('');setError('Could not save workspace name. Try again.');}};
 return <AppShell title="Settings" description="Your account, connections and preferences." activeRoute="settings" routeMode contentWidth="narrow"><div className="divide-y divide-border">
  {error&&<Notice tone="error">{error}</Notice>}
  <section className="pb-7"><div className="flex items-center gap-3"><h2 className="font-display text-lg font-semibold">Account</h2><span className="rounded-full bg-primary-soft px-2 py-1 text-xs text-primary">Alpha</span></div><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><Field label="Workspace name" className="flex-1">{props=><Input {...props} value={name} maxLength={120} onChange={e=>setName(e.target.value)}/>}</Field><Button onClick={()=>void save()} disabled={!['owner','admin'].includes(role)||!name.trim()} loading={state==='Saving…'}>Save name</Button></div><p role="status" className="mt-2 text-xs text-muted-foreground">{state}</p></section>
  {[['Assistant','Identity, behavior, voice and availability.','/dashboard/assistant'],['Phone','Identity verification, your number and activation.','/dashboard/phone'],['Balance','Credits, reservations and confirmed charges.','/dashboard/billing'],['Integrations & advanced','AI connection, CRM, legacy telephony and developer settings.','/dashboard/advanced']].map(([title,desc,href])=><section key={title} className="flex flex-wrap items-center justify-between gap-4 py-6"><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{desc}</p></div><Button asChild variant="outline"><Link href={href as import('next').Route}>Open</Link></Button></section>)}
  <section className="py-6"><h2 className="font-semibold">Team</h2><p className="mt-2 text-sm text-muted-foreground">Your role is {role||'loading'}. Team invitations are not available during beta. Your workspace remains private to its existing members.</p></section>
  <section className="py-6"><Button variant="outline" onClick={()=>void signOut().then(()=>router.replace('/login'))}>Sign out</Button></section>
 </div></AppShell>;
}
