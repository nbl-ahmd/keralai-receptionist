import { AlphaAccessError } from '@/bridge/alpha-policy.mjs';
import { NextResponse } from 'next/server';
import { resolveTenantContext, HttpError } from '@/lib/auth/context';
import { limitOperation } from './store';
import { ProviderError,providerErrorDetails } from './errors';

export async function domainRoute(request: Request, work: (tenantId: string) => Promise<unknown>, mutate = false, mutationLimit = 6) {
  try {
    const { tenantId } = await resolveTenantContext(request, mutate ? { roles:['owner','admin'] } : {});
    if (mutate) {
      const origin = request.headers.get('origin');
      const expected = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : new URL(request.url).origin;
      if (!origin || origin !== expected) throw new HttpError(403,'Invalid request origin');
      if (Number(request.headers.get('content-length') ?? 0) > 8192 || (await request.clone().text()).length > 8192) throw new HttpError(413,'Request too large');
    }
    await limitOperation(tenantId,new URL(request.url).pathname,mutate ? mutationLimit:60);
    return NextResponse.json(await work(tenantId),{ headers:{'Cache-Control':'private, no-store'} });
  } catch (error) {
    const status = error instanceof HttpError || error instanceof AlphaAccessError ? error.status:500;
    const requestId=crypto.randomUUID();
    // Provider/DB payloads are never surfaced or logged here.
    console.warn(JSON.stringify({ event:'telephony.request.failed',status,path:new URL(request.url).pathname,requestId,
      ...(error instanceof ProviderError?providerErrorDetails(error):{}) }));
    return NextResponse.json({ error:error instanceof HttpError || error instanceof AlphaAccessError ? error.message:'Unable to complete phone setup. Please try again.',requestId },
      { status,headers:{'Cache-Control':'private, no-store'} });
  }
}
