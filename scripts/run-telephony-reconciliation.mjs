// Deployment-prepared scheduler client. Configure only the application origin
// and cron secret on the scheduler; no carrier/Gemini/database credentials.
const allowedCounts=['calls','numbers','kyc','rentals','voicelinkCheckouts','voicelinkAccounts','voicelinkReviews','failures'];
try {
  const origin=new URL(process.env.TELEPHONY_PUBLIC_ORIGIN??'');
  const secret=process.env.CRON_SECRET;
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||!secret)
    throw new Error('Scheduler configuration missing');
  const response=await fetch(new URL('/api/jobs/telephony',origin),{redirect:'manual',cache:'no-store',
    headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(260000)});
  if(!response.ok)throw new Error('Reconciliation request failed');
  const data=await response.json();
  if(!allowedCounts.every(key=>Number.isSafeInteger(data[key])&&data[key]>=0)||typeof data.timeLimited!=='boolean')
    throw new Error('Invalid reconciliation report');
  console.log(JSON.stringify({event:'scheduler.reconciliation',...Object.fromEntries(allowedCounts.map(key=>[key,data[key]])),timeLimited:data.timeLimited}));
  if(data.failures||data.timeLimited||data.voicelinkReviews)process.exitCode=1;
} catch {
  console.error(JSON.stringify({event:'scheduler.reconciliation.failed'}));
  // No raw response, URL, request header, secret or error details.
  process.exitCode=1;
}
