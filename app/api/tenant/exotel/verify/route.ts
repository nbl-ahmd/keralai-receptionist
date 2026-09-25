import { NextResponse } from 'next/server';
import { handleApiError, resolveTenantContext } from '@/lib/auth/context';
import {
  exotelAuthHeader,
  getTenantExotelCredentials,
} from '@/lib/tenant/exotel-credentials';

export const dynamic = 'force-dynamic';

const VERIFY_TIMEOUT_MS = 8000;

interface ExoPhone {
  sid?: string;
  phone_number?: string;
  friendly_name?: string;
}

/**
 * Verifies the active tenant's own Exotel REST credentials by asking Exotel for
 * that account's ExoPhones. This is the server-side use of the stored
 * credentials: it proves the tester's account and number work, using their
 * credentials rather than any platform/global account.
 *
 * The credentials are decrypted server-side only and never returned.
 */
export async function POST(request: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await resolveTenantContext(request, { roles: ['owner', 'admin'] }));
  } catch (error) {
    return handleApiError(error, 'Failed to verify Exotel credentials');
  }

  const credentials = await getTenantExotelCredentials(tenantId);
  if (
    !credentials.configured ||
    !credentials.accountSid ||
    !credentials.apiKey ||
    !credentials.apiToken
  ) {
    return NextResponse.json(
      { ok: false, error: 'Add your Exotel Account SID, API key and API token first.' },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    // Exotel documents this endpoint under /v2_beta; the wrong region (subdomain)
    // returns 401, which is surfaced without leaking the credentials.
    const url = `https://${credentials.subdomain}/v2_beta/Accounts/${encodeURIComponent(
      credentials.accountSid,
    )}/IncomingPhoneNumbers`;
    const response = await fetch(url, {
      headers: {
        Authorization: exotelAuthHeader(credentials.apiKey, credentials.apiToken),
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        error:
          response.status === 401 || response.status === 403
            ? 'Exotel rejected these credentials. Check the API key, token, account SID and region.'
            : `Exotel returned HTTP ${response.status}.`,
      });
    }

    const data = (await response.json()) as { incoming_phone_numbers?: ExoPhone[] };
    const phones = Array.isArray(data.incoming_phone_numbers) ? data.incoming_phone_numbers : [];
    return NextResponse.json({
      ok: true,
      subdomain: credentials.subdomain,
      phoneCount: phones.length,
      // Cap the list; never return account/credential internals.
      phoneNumbers: phones.slice(0, 20).map((phone) => ({
        sid: phone.sid ?? null,
        number: phone.phone_number ?? null,
        name: phone.friendly_name ?? null,
      })),
    });
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') {
      return NextResponse.json({ ok: false, error: 'Exotel did not respond in time.' });
    }
    return NextResponse.json({ ok: false, error: 'Could not reach Exotel.' });
  } finally {
    clearTimeout(timeout);
  }
}
