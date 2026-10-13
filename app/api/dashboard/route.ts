import { resolveTenantContext, handleApiError } from '@/lib/auth/context';
import { getProfile, getKnowledge, getAppointments, getCalls, getContacts, getCallbackRequests, getQuoteRequests, getMessages } from '@/lib/store';
import { getCrmStatus } from '@/lib/crm';
import { bookingSettings } from '@/lib/booking';

export const dynamic = 'force-dynamic';

/** Authenticate once per snapshot; every store query still has an explicit tenant. */
export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const activityOnly = new URL(request.url).searchParams.get('scope') === 'activity';
    const [appointments, calls, callbacks, quotes, messages, configuration] = await Promise.all([
      getAppointments(tenantId), getCalls(tenantId), getCallbackRequests(tenantId),
      getQuoteRequests(tenantId), getMessages(tenantId),
      activityOnly ? Promise.resolve(null) : Promise.all([
        getProfile(tenantId), getKnowledge(tenantId), getContacts(tenantId), getCrmStatus(tenantId),
      ]),
    ]);
    return Response.json({ appointments, calls, inbox: { appointments, callbacks, quotes, messages },
      ...(configuration ? { profile: configuration[0], knowledge: configuration[1], contacts: configuration[2],
        settings: { crm: configuration[3], booking: bookingSettings } } : {}),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return handleApiError(error, 'Unable to load dashboard.'); }
}
