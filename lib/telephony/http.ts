import { AlphaAccessError } from '@/bridge/alpha-policy.mjs';
import { NextResponse } from 'next/server';
import { resolveTenantContext, HttpError } from '@/lib/auth/context';
import { limitOperation } from './store';
import { ProviderError,providerErrorDetails } from './errors';
import { getTelephonyProvider } from './provider';
import { isPhoneProvider, VOICELINK_UNAVAILABLE, type PhoneProvider } from './provider-options';

export async function domainRoute(request: Request, work: (tenantId: string, provider: PhoneProvider) => Promise<unknown>, mutate = false, mutationLimit = 6) {
  try {
    const { tenantId } = await resolveTenantContext(request, mutate ? { roles:['owner','admin'] } : {});
    // Explicit provider requests must never silently fall through to Vobiz.
    const requestedProvider = new URL(request.url).searchParams.get('provider');
    const fixedVoiceLink = new URL(request.url).pathname.startsWith('/api/telephony/voicelink');
    let provider: PhoneProvider = fixedVoiceLink ? 'voicelink' : 'vobiz';
    if (requestedProvider !== null) {
      if (fixedVoiceLink && requestedProvider !== 'voicelink') throw new HttpError(400, 'Conflicting phone providers');
      if (!isPhoneProvider(requestedProvider)) throw new HttpError(400, 'Unknown phone provider');
      getTelephonyProvider(requestedProvider);
      provider = requestedProvider;
    }
    if (mutate) {
      const origin = request.headers.get('origin');
      const expected = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : new URL(request.url).origin;
      if (!origin || origin !== expected) throw new HttpError(403,'Invalid request origin');
      if (Number(request.headers.get('content-length') ?? 0) > 8192) throw new HttpError(413,'Request too large');
      const text = await request.clone().text();
      if (text.length > 8192) throw new HttpError(413,'Request too large');
      if (text) {
        let body: unknown;
        try { body = JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON'); }
        if (body && typeof body === 'object' && 'provider' in body) {
          if (fixedVoiceLink && body.provider !== 'voicelink') throw new HttpError(400, 'Conflicting phone providers');
          if (!isPhoneProvider(body.provider)) throw new HttpError(400, 'Unknown phone provider');
          getTelephonyProvider(body.provider);
          if (requestedProvider !== null && requestedProvider !== body.provider) throw new HttpError(400, 'Conflicting phone providers');
          provider = body.provider;
        }
      }
    }
    if (provider === 'voicelink' && !['/api/telephony/account', '/api/telephony/kyc', '/api/telephony/kyc/session',
      '/api/telephony/voicelink', '/api/telephony/voicelink/inventory', '/api/telephony/voicelink/checkout',
      '/api/telephony/voicelink/checkout/confirm'].includes(new URL(request.url).pathname)) {
      throw new HttpError(503, VOICELINK_UNAVAILABLE);
    }
    await limitOperation(tenantId,new URL(request.url).pathname,mutate ? mutationLimit:60);
    return NextResponse.json(await work(tenantId, provider),{ headers:{'Cache-Control':'private, no-store'} });
  } catch (error) {
    const status = error instanceof HttpError || error instanceof AlphaAccessError ? error.status:500;
    const requestId=crypto.randomUUID();
    // Provider/DB payloads are never surfaced or logged here.
    console.warn(JSON.stringify({ event:'telephony.request.failed',status,path:new URL(request.url).pathname,requestId,
      ...(/^[a-z]{3}\d$/.test(process.env.VERCEL_REGION ?? '') ? { region: process.env.VERCEL_REGION } : {}),
      ...(error instanceof ProviderError?providerErrorDetails(error):{}) }));
    return NextResponse.json({ error:error instanceof HttpError || error instanceof AlphaAccessError ? error.message:'Unable to complete phone setup. Please try again.',requestId },
      { status,headers:{'Cache-Control':'private, no-store'} });
  }
}
