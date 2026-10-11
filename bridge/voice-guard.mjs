// Independent duration timer plus non-overlapping rolling checks, shared by transports.
export function installVoiceGuard({expiresAt,check,end,intervalMs=30000}) {
 let stopped=false,checking=false;
 const stop=reason=>{if(stopped)return;stopped=true;clearTimeout(duration);clearInterval(rolling);void Promise.resolve(end(reason)).catch(()=>{});};
 const duration=setTimeout(()=>stop('max_duration'),Math.max(1,new Date(expiresAt).getTime()-Date.now()));
 const rolling=setInterval(async()=>{
  if(stopped||checking)return;checking=true;
  try{const decision=await check();if(!decision.allowed)stop('authorization_revoked');}
  catch{stop('authorization_unavailable');}finally{checking=false;}
 },intervalMs);
 duration.unref?.();rolling.unref?.();
 return ()=>{stopped=true;clearTimeout(duration);clearInterval(rolling);};
}
