"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Mic, ArrowLeft, Phone, User, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import VoiceConsole from '@/components/dashboard/VoiceConsole';
import { phoneApi } from '@/lib/telephony/client-ui';
import type { CompanyProfile } from '@/types';
const steps=['purpose','identity','behavior','knowledge','test','phone'] as const;
const labels=['Your assistant','Identity','Behavior','Knowledge','Try a conversation','Phone'];
type Purpose='personal'|'business'|'other';
interface Setup {managedAi?:boolean;onboarding:{purpose:Purpose;step:string;browser_test_completed_at:string|null};profile:CompanyProfile}
export default function OnboardingPage(){
 const router=useRouter();
 const [setup,setSetup]=useState<Setup|null>(null),[step,setStep]=useState(0),[purpose,setPurpose]=useState<Purpose>('personal');
 const [profile,setProfile]=useState<CompanyProfile>({name:'',industry:'',description:'',address:'',contactPhone:'',contactEmail:'',assistantName:'',assistantLanguage:'',assistantInstructions:''});
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[voice,setVoice]=useState(false),[knowledge,setKnowledge]=useState('');
 useEffect(()=>{let cancelled=false;void phoneApi('/api/onboarding').then((data:Setup)=>{
  if(cancelled)return;setSetup(data);setProfile(data.profile);setPurpose(data.onboarding.purpose);setStep(Math.max(0,steps.indexOf(data.onboarding.step as typeof steps[number])));
 }).catch(e=>setError(e.message));return()=>{cancelled=true;};},[]);
 const patch=(key:keyof CompanyProfile,value:string)=>setProfile(p=>({...p,[key]:value}));
 const save=async(next:number,complete=false)=>{
  setBusy(true);setError(null);
  try{
   if(step===1 && !profile.name.trim())throw new Error('Add your name or business name.');
   const data=await phoneApi('/api/onboarding',{purpose,step:complete?'complete':steps[next],profile:{name:profile.name,assistantName:profile.assistantName??'',assistantLanguage:profile.assistantLanguage??'',description:profile.description,assistantInstructions:profile.assistantInstructions??''}});
   setSetup(data);setStep(next);if(complete){router.push('/dashboard');router.refresh();}
  }catch(e){setError(e instanceof Error?e.message:'Could not save your setup.');}finally{setBusy(false);}
 };
 const saveKnowledge=async()=>{
  setBusy(true);setError(null);
  try{if(knowledge.trim())await phoneApi('/api/knowledge',{id:crypto.randomUUID(),title:'Getting started',type:'text',content:knowledge.trim(),dateAdded:new Date().toISOString(),isActive:true});await save(4);}
  catch(e){setError(e instanceof Error?e.message:'Could not save knowledge.');}finally{setBusy(false);}
 };
 return <main className="min-h-dvh bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:px-8">
  <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-border pb-5"><Link href="/dashboard" className="font-display text-xl font-semibold tracking-tight">KeralAI<span className="text-primary">.</span></Link><span className="text-xs text-muted-foreground" aria-live="polite">{busy?'Saving…':`Step ${step+1} of ${steps.length}`}</span></header>
  <div className="mx-auto grid max-w-5xl gap-10 py-10 md:grid-cols-[200px_minmax(0,1fr)] md:py-16">
   <aside><h1 className="font-display text-2xl font-semibold tracking-tight">Make room for your day.</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">A few details help your assistant sound like it belongs with you.</p>
    <ol className="mt-8 hidden space-y-5 md:block" aria-label="Assistant setup">{labels.map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={`flex items-center gap-3 text-sm ${step===i?'font-semibold text-primary':'text-muted-foreground'}`}><span className="flex h-6 w-6 items-center justify-center rounded-full border border-current">{i<step?<Check className="h-3 w-3"/>:i+1}</span>{label}</li>)}</ol>
   </aside>
   <section className="min-w-0 max-w-xl" aria-label={labels[step]}>
    {error&&<Notice tone="error" className="mb-5"><span role="alert">{error}</span></Notice>}
    {!setup?<div><Skeleton className="h-12 w-3/4"/><Skeleton className="mt-6 h-52"/>{error&&<Button className="mt-4" onClick={()=>window.location.reload()}>Try again</Button>}</div>:<>
     {step===0&&<><h2 className="font-display text-2xl font-semibold">What can we take off your hands?</h2><div className="mt-8 space-y-3" role="radiogroup" aria-label="Assistant purpose">{([
      ['personal','Personal assistant','Take messages, arrange callbacks and answer when you’re unavailable.',User],
      ['business','Business receptionist','Welcome callers, answer questions, capture leads and book appointments.',Briefcase],
      ['other','Something else','Give your assistant a purpose of its own.',Phone]
     ] as const).map(([value,label,detail,Icon])=><button key={value} role="radio" aria-checked={purpose===value} onClick={()=>setPurpose(value)} className={`flex min-h-[88px] w-full items-start gap-4 rounded-xl border p-4 text-left ${purpose===value?'border-primary bg-primary-soft':'border-border bg-background'}`}><Icon className="mt-1 h-5 w-5 shrink-0 text-primary"/><span><span className="block font-semibold">{label}</span><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{detail}</span></span></button>)}</div></>}
     {step===1&&<><h2 className="font-display text-2xl font-semibold">Give your assistant an identity</h2><div className="mt-7 space-y-5">
      <Field label={purpose==='business'?'Business name':'Your name'}>{props=><Input {...props} value={profile.name} maxLength={120} onChange={e=>patch('name',e.target.value)}/>}</Field>
      <Field label="Assistant name" hint="Optional. This is how your assistant introduces itself.">{props=><Input {...props} value={profile.assistantName??''} maxLength={80} onChange={e=>patch('assistantName',e.target.value)} placeholder="For example, Maya"/>}</Field>
      <Field label="Preferred language" hint="Leave blank to match the caller.">{props=><Input {...props} value={profile.assistantLanguage??''} maxLength={120} onChange={e=>patch('assistantLanguage',e.target.value)} placeholder="Malayalam and English"/>}</Field>
      <Field label={purpose==='business'?'A little about your business':'What should callers know about you?'}>{props=><Textarea {...props} value={profile.description} maxLength={2000} onChange={e=>patch('description',e.target.value)} rows={3}/>}</Field>
     </div></>}
     {step===2&&<><h2 className="font-display text-2xl font-semibold">How should it help?</h2><p className="mt-3 text-sm text-muted-foreground">Tell your assistant what to do and how to respond. You can change this any time.</p><div className="mt-7 space-y-4"><Field label="Main instructions" hint={purpose==='personal'?'For example: Take a message, ask how urgent it is, and offer a callback.':'For example: Greet callers warmly, answer opening-hours questions, and capture appointment requests.'}>{props=><Textarea {...props} rows={7} value={profile.assistantInstructions??''} onChange={e=>patch('assistantInstructions',e.target.value)} maxLength={4000}/>}</Field><p className="text-xs text-muted-foreground">The assistant will not invent answers. Teach it any facts callers might ask about in the next step.</p></div></>}
     {step===3&&<><h2 className="font-display text-2xl font-semibold">Teach it a little more</h2><p className="mt-3 text-sm text-muted-foreground">Add opening hours, services, FAQs or details you’re happy to share with callers. This step is optional.</p><Field label="Information for your assistant" className="mt-7">{props=><Textarea {...props} rows={8} value={knowledge} onChange={e=>setKnowledge(e.target.value)} maxLength={12000}/>}</Field></>}
     {step===4&&<><h2 className="font-display text-2xl font-semibold">Try a conversation</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Call your assistant right here. Ask a question, leave a message and hear how it responds before you get a phone number.</p><div className="my-8 flex items-center gap-4 border-y border-border py-7"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"><Mic className="h-6 w-6"/></span><div><p className="font-semibold">{profile.assistantName||'Your assistant'}</p><p className="text-sm text-muted-foreground">{profile.assistantLanguage||'Matches the caller’s language'}</p></div></div><Button className="w-full sm:w-auto" onClick={()=>setVoice(true)}>Test assistant</Button><p className="mt-4 text-xs text-muted-foreground">{setup.managedAi ? <>AI access is included for invited alpha testers. Contact your organiser if it is unavailable.</> : <>Your assistant needs an AI connection. <Link href="/dashboard/advanced" className="text-primary underline">Connect your AI account</Link> if your account is not ready yet.</>}</p>{setup.onboarding.browser_test_completed_at&&<p className="mt-4 flex items-center gap-2 text-sm text-primary"><Check className="h-4 w-4"/>Browser connection tested</p>}</>}
     {step===5&&<><h2 className="font-display text-2xl font-semibold">Ready for real calls?</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Get a dedicated number, verify your identity securely, and activate your assistant. We connect everything for you.</p><div className="my-8 border-y border-border py-6 text-sm"><p className="font-medium">Verify identity · Choose a number · Add balance</p><p className="mt-3 text-muted-foreground">You can use your assistant in the browser and activate phone calls later.</p></div><Button asChild className="w-full sm:w-auto"><Link href="/dashboard/phone">Get a phone number</Link></Button></>}
     <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
      <Button variant="ghost" disabled={busy||step===0} onClick={()=>void save(step-1)}><ArrowLeft className="mr-2 h-4 w-4"/>Back</Button>
      <div className="flex flex-wrap gap-2">{step===3&&<Button variant="ghost" disabled={busy} onClick={()=>void save(4)}>Skip for now</Button>}
       <Button loading={busy} onClick={()=>void (step===3?saveKnowledge():save(Math.min(5,step+1),step===5))}>{step===5?'Open dashboard':step===4?'Continue':step===3?'Save information':'Continue'}</Button></div>
     </div>
    </>}
   </section>
  </div>
  <VoiceConsole open={voice} onClose={()=>{setVoice(false);void phoneApi('/api/onboarding').then(setSetup).catch(()=>{});}} companyProfile={profile} onBookAppointment={()=>{}} autoConnect/>
 </main>;
}
