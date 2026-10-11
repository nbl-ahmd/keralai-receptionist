import { answerCall } from '@/lib/telephony/inbound';
import { unavailableXml } from '@/lib/telephony/providers/vobiz/xml';
export const dynamic='force-dynamic';
export const POST=async(r:Request)=>{
 try { return new Response(await answerCall(r),{headers:{'Content-Type':'application/xml','Cache-Control':'no-store'}}); }
 catch { console.warn(JSON.stringify({event:'vobiz.call.rejected'})); return new Response(unavailableXml,{headers:{'Content-Type':'application/xml','Cache-Control':'no-store'}}); }
};
