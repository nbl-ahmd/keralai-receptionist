import { domainRoute } from '@/lib/telephony/http';
import { voiceLinkProvider } from '@/lib/telephony/providers/voicelink/provider';
import { HttpError } from '@/lib/auth/context';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => domainRoute(request, async () => {
  const params = new URL(request.url).searchParams;
  const page = Number(params.get('page') ?? '1'), search = params.get('search') ?? '';
  if (!Number.isInteger(page) || page < 1 || page > 1000 || !/^[+0-9]{0,16}$/.test(search)) throw new HttpError(400, 'Invalid number search');
  const inventory = await voiceLinkProvider.searchAvailableNumbers({ page, search });
  return { items: inventory.items.map(item => ({ e164: item.e164, region: item.region, monthlyCost: item.monthlyCost,
    channelMonthlyCost: item.channelMonthlyCost, currency: item.currency })), page, purchaseAvailable: false };
});
