"use client";
import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Field} from '@/components/ui/field';
import {Notice} from '@/components/ui/notice';
import {Skeleton} from '@/components/ui/skeleton';
import {phoneApi} from '@/lib/telephony/client-ui';
import type {managedKycState} from '@/lib/telephony/providers/voicelink/kyc';
type State=ReturnType<typeof managedKycState>;
export default function VoiceLinkVerification({onVerified}:{onVerified:()=>Promise<void>}) {
 const [data,setData]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [editDetails,setEditDetails]=useState(false),[type,setType]=useState('individual'),[terms,setTerms]=useState(false);
 const [details,setDetails]=useState({fullName:'',businessName:'',phone:'',address:'',state:'',city:'',pincode:''});
 const [pan,setPan]=useState(''),[holderName,setHolderName]=useState(''),[gst,setGst]=useState(''),[otp,setOtp]=useState('');
 const load=useCallback(async()=>{setBusy(true);try{const next=await phoneApi('/api/telephony/voicelink/kyc');setData(next);setType(next.accountType);setError('');if(next.status==='verified')await onVerified();}catch(e){setError(e instanceof Error?e.message:'Verification progress is unavailable.');}finally{setBusy(false);}},[onVerified]);
 useEffect(()=>{void load();},[load]);
 const act=async(action:string,extra:Record<string,unknown>={})=>{
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{const next=await phoneApi('/api/telephony/voicelink/kyc',{action,...extra});
   if(action==='aadhaar'){window.location.assign(next.redirectUrl);return;}
   setData(next);setEditDetails(false);setMessage('Your verification progress has been updated.');if(next.status==='verified')await onVerified();
  }catch(e){setError(e instanceof Error?e.message:'Unable to confirm verification.');}finally{setPan('');setGst('');setOtp('');setBusy(false);}
 };
 const upload=async(documentType:string,file:File,input:HTMLInputElement)=>{
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{if(file.size>3*1024*1024)throw new Error('Choose a document up to 3 MB.');const body=new FormData();body.set('documentType',documentType);body.set('document',file);
   const response=await fetch('/api/telephony/voicelink/kyc/upload',{method:'POST',body,cache:'no-store'});const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Upload could not be confirmed. Check progress before retrying.');setData(result);setMessage('Document sent securely to VoiceLink.');
  }catch(e){setError(e instanceof Error?e.message:'Upload could not be confirmed.');}finally{input.value='';setBusy(false);}
 };
 const uploadField=(documentType:string,label:string)=><Field label={label} hint="PDF, JPG or PNG, up to 3 MB. Forwarded to VoiceLink; not saved in your workspace.">{props=><Input {...props} type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={event=>{const file=event.currentTarget.files?.[0];if(file)void upload(documentType,file,event.currentTarget);}}/>}</Field>;
 return <section className="space-y-5" aria-label="Identity verification">
  <p className="text-sm text-muted-foreground">We manage your phone account. Complete verification here; you do not need to register separately or set up a VoiceLink password. Identity details and supporting documents are forwarded securely to VoiceLink and are not saved in your workspace.</p>
  <p className="text-sm text-muted-foreground">If VoiceLink sends an email-confirmation link, confirm your email and return here. You do not need to sign in to its portal.</p>
  <details className="rounded-lg border border-border p-4"><summary className="min-h-11 cursor-pointer text-sm font-medium">Confirm email with a code, if VoiceLink requests it</summary><div className="space-y-3"><p className="text-sm text-muted-foreground">For accounts using email links, use the link in your email instead. No provider password is needed for this app’s verification flow.</p><Field label="Email verification code">{props=><Input {...props} autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={otp} disabled={busy} onChange={event=>setOtp(event.target.value.replace(/[^0-9]/g,''))}/>}</Field><div className="flex flex-wrap gap-3"><Button disabled={busy||otp.length!==6} onClick={()=>void act('verify_email',{otp})}>Confirm email</Button><Button variant="outline" disabled={busy} onClick={()=>void act('resend_email')}>Send new code</Button></div></div></details>
  {error&&<Notice tone="error">{error}</Notice>}{message&&<Notice tone="success">{message}</Notice>}
  {!data?<Skeleton className="h-36"/>:data.status==='verified'?<Notice tone="success">Identity verified. You can continue to choose your number.</Notice>:<>
   <ol className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label="Verification progress">{[['Details',data.step!=='register'],['PAN',data.documents.pan?.verified&&data.documents.pan?.uploaded],['Aadhaar',data.documents.aadhaar?.verified&&data.documents.aadhaar?.uploaded],['Review',data.readyForSubmission]].map(([label,done])=><li key={String(label)} className={`rounded-lg border p-3 ${done?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-border text-muted-foreground'}`}>{done?'✓ ':''}{label}</li>)}</ol>
   {data.agreementNeedsAcceptance&&<Notice tone="info">The provider needs you to review and accept its updated verification terms. Use Review or update legal details below.</Notice>}
   {(data.step==='register'||editDetails)?<form className="space-y-4 rounded-xl border border-border p-4 sm:p-5" onSubmit={event=>{event.preventDefault();void act('register',{...details,accountType:type,acceptTerms:terms});}}>
    <h3 className="font-semibold">Your verification details</h3>
    <label className="block text-sm font-medium">Account type<select aria-label="Account type" className="mt-2 min-h-11 w-full rounded-lg border border-border bg-white px-3" value={type} disabled={busy} onChange={event=>setType(event.target.value)}><option value="individual">Individual</option><option value="business">Business</option></select></label>
    <div className="grid gap-4 sm:grid-cols-2">{([['fullName','Full legal name'],...(type==='business'?[['businessName','Business name']]:[]),['phone','Contact number (+91)'],['address','Billing address'],['state','State'],['city','City'],['pincode','Postal code']] as Array<[keyof typeof details,string]>).map(([key,label])=><Field key={key} label={label}>{props=><Input {...props} required disabled={busy} autoComplete="off" maxLength={key==='address'?500:150} value={details[key]} onChange={event=>setDetails(current=>({...current,[key]:event.target.value}))}/>}</Field>)}</div>
    {data.termsUrl?<a href={data.termsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-primary underline">Read VoiceLink verification terms</a>:<Notice tone="info">Your organiser is obtaining the provider’s verification terms. Details can be entered, but cannot be submitted until the terms are available for review.</Notice>}
    <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed"><input className="mt-1" type="checkbox" checked={terms} disabled={busy||!data.termsUrl} onChange={event=>setTerms(event.target.checked)}/>I have reviewed and accept VoiceLink’s terms and telecom compliance requirements for identity verification.</label>
    <Button type="submit" loading={busy} disabled={!terms||!data.termsUrl}>Save verification details</Button>
   </form>:<Button variant="ghost" disabled={busy} onClick={()=>setEditDetails(true)}>Review or update legal details</Button>}
   {!editDetails&&data.step!=='register'&&<div className="space-y-5">
    <section className="space-y-4 rounded-xl border border-border p-4 sm:p-5"><h3 className="font-semibold">PAN verification</h3>
     {!data.documents.pan?.verified?<form className="space-y-4" onSubmit={event=>{event.preventDefault();void act('pan',{pan,holderName});}}><Field label="Name on PAN">{props=><Input {...props} autoComplete="off" value={holderName} maxLength={150} required disabled={busy} onChange={event=>setHolderName(event.target.value)}/>}</Field><Field label="PAN number">{props=><Input {...props} autoComplete="off" value={pan} maxLength={10} required disabled={busy} onChange={event=>setPan(event.target.value.toUpperCase())}/>}</Field><Button type="submit" loading={busy}>Verify PAN</Button></form>:data.documents.pan.uploaded?<p className="text-sm text-emerald-700">PAN verified and document received.</p>:uploadField('pan','Upload PAN document')}
    </section>
    {data.documents.pan?.verified&&data.documents.pan?.uploaded&&<section className="space-y-4 rounded-xl border border-border p-4 sm:p-5"><h3 className="font-semibold">Aadhaar verification</h3>
     {!data.documents.aadhaar?.verified?<><p className="text-sm text-muted-foreground">Continue securely through DigiLocker. You will return here afterward; we check the result directly with VoiceLink.</p><Button loading={busy} onClick={()=>void act('aadhaar')}>Continue with DigiLocker</Button></>:data.documents.aadhaar.uploaded?<p className="text-sm text-emerald-700">Aadhaar verified and document received.</p>:uploadField('aadhaar','Upload Aadhaar document')}
    </section>}
    {data.accountType==='business'&&data.documents.aadhaar?.verified&&data.documents.aadhaar?.uploaded&&<section className="space-y-4 rounded-xl border border-border p-4 sm:p-5"><h3 className="font-semibold">Business verification</h3>
     {!data.documents.gst?.verified?<form className="space-y-4" onSubmit={event=>{event.preventDefault();void act('gst',{gst});}}><Field label="GSTIN">{props=><Input {...props} autoComplete="off" value={gst} maxLength={15} required disabled={busy} onChange={event=>setGst(event.target.value.toUpperCase())}/>}</Field><Button type="submit" loading={busy}>Verify GSTIN</Button></form>:data.documents.gst.uploaded?<p className="text-sm text-emerald-700">GST verified and certificate received.</p>:uploadField('gst','Upload GST certificate')}
    </section>}
   </div>}
   {data.readyForSubmission&&<section className="space-y-3"><h3 className="font-semibold">Final review</h3>{!data.finalSubmissionAvailable&&<Notice tone="info">Your document checks are complete. Your organiser is confirming the provider’s final submission process; you do not need to create another account.</Notice>}<Button loading={busy} disabled={!data.finalSubmissionAvailable} onClick={()=>void act('submit')}>Submit verification</Button></section>}
  </>}
  <Button variant="outline" loading={busy} onClick={()=>void load()}>Check verification progress</Button>
 </section>;
}
