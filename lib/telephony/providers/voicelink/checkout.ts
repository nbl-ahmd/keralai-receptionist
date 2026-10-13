import { query, queryOne } from '@/db/client';
import { HttpError } from '@/lib/auth/context';
import { requireCapability } from '@/lib/alpha/entitlements';
import { getTenantGeminiApiKey } from '@/lib/gemini';
import { getAccount, getNumbers, getNumber, reserveNumber, requireActiveTenant, withOperationLock } from '../../store';
import { requirePhoneSetupEligibility, syncKyc } from '../../service';
import { assertActivationAllowed, normalizeE164, operationKey, price, publicOrigin } from '../../policy';
import { assertParentFunding, didExposure } from '../../did-policy';
import { voiceLinkProvider } from './provider';
import { VoiceLinkCommerce, voiceLinkPurchaseTerms, type VoiceLinkOrderQuote } from './commerce';

interface Checkout {
  id: string; tenant_id: string; telephony_account_id: string; e164: string;
  provider_did_id: string; provider_order_id: string | null; provider_purchase_id: string | null;
  phone_number_id: string | null; state: string; quote: VoiceLinkOrderQuote | null; expires_at: string | null;
}
const commerce = new VoiceLinkCommerce();
async function eligible(tenantId: string) {
  await requireActiveTenant(tenantId);
  await requirePhoneSetupEligibility(tenantId);
  await requireCapability(tenantId, 'number_purchase');
  await syncKyc(tenantId, 'voicelink');
  const account = await getAccount(tenantId, 'voicelink');
  assertActivationAllowed(account);
  if (!account?.provider_auth_id || !account.provider_account_id) throw new HttpError(409, 'Create your VoiceLink account first.');
  const ref = { tenantId, authId: account.provider_auth_id, accountId: account.provider_account_id };
  await voiceLinkProvider.getCustomerAccount(ref);
  return { account, ref };
}
function confirmationBlocker() {
  try { voiceLinkPurchaseTerms(); } catch (error) { return (error as Error).message; }
  if (!voiceLinkProvider.activationReady) return 'VoiceLink call authentication and controls must pass before paying for a number.';
  return null;
}
function customerPrices() {
  const monthlyMinor = price('VOICELINK_CUSTOMER_MONTHLY_PRICE_MINOR');
  const raw = process.env.VOICELINK_CUSTOMER_SETUP_PRICE_MINOR;
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 10000000) throw new HttpError(503, 'VoiceLink customer prices need operator configuration.');
  return { monthlyMinor, setupMinor: Number(raw), initialChargeMinor: monthlyMinor + Number(raw) };
}
function view(row: Checkout) {
  let customerPrice = null, terms = null;
  try { customerPrice = customerPrices(); } catch { /* No invented retail prices. */ }
  try { terms = voiceLinkPurchaseTerms(); } catch { /* No invented exit terms. */ }
  return { id: row.id, e164: row.e164, state: row.state, quote: row.quote, expiresAt: row.expires_at,
    customerPrice, terms,
    confirmationAvailable: !!customerPrice && row.state === 'quoted' && !!row.expires_at && Date.parse(row.expires_at) > Date.now() && !confirmationBlocker(),
    confirmationBlocker: confirmationBlocker(), callsActive: false };
}
export async function voiceLinkCheckoutStatus(tenantId: string) {
  const row = await queryOne<Checkout>("select * from voicelink_checkouts where tenant_id=$1 and state<>'expired' order by created_at desc limit 1", [tenantId]);
  return { checkout: row ? view(row) : null };
}
export async function prepareVoiceLinkCheckout(tenantId: string, input: { e164: unknown; key: unknown }) {
  const e164 = normalizeE164(input.e164), key = operationKey(input.key);
  return withOperationLock(tenantId, async () => {
    const { account } = await eligible(tenantId);
    if ((await getNumbers(tenantId)).length) throw new HttpError(409, 'This workspace already has a number or reservation.');
    const previous = await queryOne<Checkout>("select * from voicelink_checkouts where tenant_id=$1 and state<>'expired'", [tenantId]);
    if (previous) {
      if (previous.e164 !== e164) throw new HttpError(409, 'Finish or have your operator resolve the existing number quote first.');
      return view(previous);
    }
    const inventory = await voiceLinkProvider.searchAvailableNumbers({ search: e164 });
    const selected = inventory.items.find(item => item.e164 === e164 && item.country === 'IN' && item.voice && item.currency === 'INR');
    if (!selected) throw new HttpError(409, 'That number is no longer available.');
    const row = await queryOne<Checkout>(`insert into voicelink_checkouts(tenant_id,telephony_account_id,e164,provider_did_id,idempotency_key)
      values($1,$2,$3,$4,$5) returning *`, [tenantId, account.id, e164, selected.id, key]);
    if (!row) throw new HttpError(503, 'Unable to prepare your number quote.');
    try {
      const locked = await commerce.lock(selected.id, e164);
      // Persist the provider order before any subsequent read or paid operation.
      await query('update voicelink_checkouts set provider_order_id=$3,updated_at=now() where tenant_id=$1 and id=$2', [tenantId, row.id, locked.orderId]);
      const quote = await commerce.quote(locked.orderId, locked.monthlyMinor);
      const quoted = await queryOne<Checkout>(`update voicelink_checkouts set state='quoted',quote=$3,
        expires_at=created_at+interval '8 minutes',updated_at=now() where tenant_id=$1 and id=$2 returning *`, [tenantId, row.id, JSON.stringify(quote)]);
      return view(quoted!);
    } catch (error) {
      await query("update voicelink_checkouts set state='draft_unknown',updated_at=now() where tenant_id=$1 and id=$2", [tenantId, row.id]);
      throw error;
    }
  });
}
export async function confirmVoiceLinkCheckout(tenantId: string, input: { id: unknown; acceptsAutoRenew: unknown; acceptedChargeMinor: unknown; acceptedTermsReference?: unknown }) {
  if (typeof input.id !== 'string' || !/^[a-f0-9-]{36}$/.test(input.id)) throw new HttpError(400, 'Invalid number quote.');
  if (input.acceptsAutoRenew !== true) throw new HttpError(400, 'Confirm the recurring renewal terms before purchasing.');
  return withOperationLock(tenantId, async () => {
    const row = await queryOne<Checkout>('select * from voicelink_checkouts where tenant_id=$1 and id=$2', [tenantId, input.id]);
    if (!row) throw new HttpError(404, 'Number quote not found.');
    if (row.state !== 'quoted' || !row.quote || !row.provider_order_id) throw new HttpError(409, 'This purchase cannot be repeated. Your operator must review its current state.');
    if (!row.expires_at || Date.parse(row.expires_at) <= Date.now()) throw new HttpError(409, 'This quote expired. Your operator must resolve the draft before a new reservation.');
    const terms = voiceLinkPurchaseTerms();
    if (input.acceptedTermsReference !== terms.reference) throw new HttpError(409, 'Renewal terms changed. Review the updated terms before confirming.');
    if (!voiceLinkProvider.activationReady) throw new HttpError(503, confirmationBlocker()!);
    const retail = customerPrices();
    if (input.acceptedChargeMinor !== retail.initialChargeMinor) throw new HttpError(409, 'Your app price changed. Review the updated price before confirming.');
    const { account, ref } = await eligible(tenantId);
    if (account.id !== row.telephony_account_id) throw new HttpError(409, 'The provider account changed.');
    const fresh = await commerce.quote(row.provider_order_id, row.quote.monthlyMinor);
    if (JSON.stringify(fresh) !== JSON.stringify(row.quote)) throw new HttpError(409, 'Provider pricing changed. Your operator must review the quote.');
    const exposure = didExposure({ id: row.provider_did_id, e164: row.e164, country: 'IN', currency: 'INR', voice: true,
      region: '', monthlyCost: (Math.max(fresh.totalMinor, fresh.monthlyMinor) / 100).toFixed(2), setupCost: '0.00',
      releaseCost: (terms.releaseMinor / 100).toFixed(2), commitmentMonths: terms.commitmentMonths, available: true, restricted: false });
    const balance = await voiceLinkProvider.getPlatformBalance(); assertParentFunding(balance, exposure);
    publicOrigin();
    if (!process.env.BRIDGE_PUBLIC_URL || !process.env.BRIDGE_AUTH_SECRET || !await getTenantGeminiApiKey(tenantId)) throw new HttpError(503, 'Test and configure your assistant before purchase.');
    const monthlyPrice = retail.monthlyMinor, setupPrice = retail.setupMinor;
    const number = await reserveNumber({ tenantId, accountId: account.id, provider: 'voicelink', e164: row.e164, region: '',
      providerNumberId: row.provider_did_id, monthlyCost: (fresh.monthlyMinor / 100).toFixed(2), monthlyPrice, setupPrice,
      providerExposure: exposure, parentBalance: balance, charge: monthlyPrice + setupPrice, key: `voicelink_${row.id}` });
    await query(`update voicelink_checkouts set state='confirming',phone_number_id=$3,accepted_terms_reference=$4,
      accepted_charge_minor=$5,accepted_at=now(),updated_at=now() where tenant_id=$1 and id=$2`, [tenantId, row.id, number.id, terms.reference, retail.initialChargeMinor]);
    try {
      const purchaseId = await commerce.confirm(row.provider_order_id, fresh.totalMinor);
      await query("update voicelink_checkouts set state='purchased',provider_purchase_id=$3,updated_at=now() where tenant_id=$1 and id=$2", [tenantId, row.id, purchaseId]);
    } catch (error) {
      await query("update voicelink_checkouts set state='purchase_unknown',updated_at=now() where tenant_id=$1 and id=$2", [tenantId, row.id]);
      await query("update phone_numbers set status='failed',provisioning_status='purchase_unknown',updated_at=now() where tenant_id=$1 and id=$2", [tenantId, number.id]);
      throw error;
    }
    // Persist assignment intent before POST. Never repeat mapping after a timeout.
    await query("update voicelink_checkouts set state='assignment_unknown',updated_at=now() where tenant_id=$1 and id=$2", [tenantId, row.id]);
    await commerce.assign(ref.authId, row.provider_did_id);
    const owned = await voiceLinkProvider.listOwnedNumbers(ref, 1);
    if (!owned.items.some(item => item.id === row.provider_did_id && item.e164 === row.e164)) throw new HttpError(503, 'The purchase succeeded; client assignment needs operator reconciliation.');
    await query("update phone_numbers set status='configuring',provisioning_status='purchased',updated_at=now() where tenant_id=$1 and id=$2", [tenantId, number.id]);
    await query("update voicelink_checkouts set state='assigned',updated_at=now() where tenant_id=$1 and id=$2", [tenantId, row.id]);
    // Purchasing/assignment never marks a number active or captures its hold.
    return { checkout: { ...view(row), state: 'assigned', confirmationAvailable: false }, number: await getNumber(tenantId, number.id) };
  });
}
