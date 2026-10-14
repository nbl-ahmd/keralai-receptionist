import { resolveTenantContext, HttpError } from '@/lib/auth/context';
import { AlphaAccessError } from '@/bridge/alpha-policy.mjs';
import { limitOperation, requireActiveTenant } from '../../store';
import { ProviderError, providerErrorDetails } from '../../errors';

/** Identity data is forwarded in memory only; never persisted, logged or cached. */
export async function managedKycRoute(request:Request,work:(tenantId:string,input:Record<string,unknown>|FormData)=>Promise<unknown>,upload=false) {
  try {
    const {tenantId}=await resolveTenantContext(request,{roles:['owner','admin']});
    await requireActiveTenant(tenantId);
    const mutate=request.method!=='GET';
    const requestedProvider=new URL(request.url).searchParams.get('provider');
    if(requestedProvider!==null&&requestedProvider!=='voicelink')throw new HttpError(400,'Conflicting phone providers.');
    if(mutate) {
      const expected=new URL(process.env.BETTER_AUTH_URL??request.url).origin;
      if(request.headers.get('origin')!==expected)throw new HttpError(403,'Invalid request origin.');
    }
    await limitOperation(tenantId,new URL(request.url).pathname,mutate?6:60);
    let input:Record<string,unknown>|FormData={};
    if(mutate) {
      const limit=upload?3*1024*1024+32768:8192;
      if(Number(request.headers.get('content-length')??0)>limit)throw new HttpError(413,'Verification request is too large.');
      const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
      if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new HttpError(413,'Verification request is too large.');}chunks.push(value);}
      const bytes=Buffer.concat(chunks);
      if(upload) {
        if(!request.headers.get('content-type')?.startsWith('multipart/form-data;'))throw new HttpError(400,'Upload the document as a file.');
        try{input=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')!},body:bytes}).formData();}
        catch{throw new HttpError(400,'Invalid document upload.');}
        for(const key of input.keys())if(!['documentType','document'].includes(key)||input.getAll(key).length!==1)throw new HttpError(400,'Unexpected verification field.');
      }else {
        try{const parsed=JSON.parse(bytes.toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();input=parsed;}
        catch{throw new HttpError(400,'Invalid verification request.');}
        if(['client_id','clientId','tenantId','redirect_url','redirectUrl'].some(key=>key in input))throw new HttpError(400,'Account and return destination are assigned by the server.');
      }
    }
    return Response.json(await work(tenantId,input),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
  }catch(error) {
    const requestId=crypto.randomUUID();
    const status=error instanceof HttpError||error instanceof AlphaAccessError?error.status:503;
    console.warn(JSON.stringify({event:'telephony.kyc.failed',requestId,status,...(error instanceof ProviderError?providerErrorDetails(error):{})}));
    return Response.json({error:error instanceof HttpError||error instanceof AlphaAccessError?error.message:'Verification could not be confirmed. Check your progress before trying again.',requestId},
      {status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
  }
}
