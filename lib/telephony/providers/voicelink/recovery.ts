import { query, queryOne } from '@/db/client';
import { transaction } from '@/db/transaction';
import { HttpError } from '@/lib/auth/context';
import { getAccount, withOperationLock, requireActiveTenant } from '../../store';
import { requirePhoneSetupEligibility } from '../../service';
import { ProviderError } from '../../errors';
import { VoiceLinkClient, providerId } from './client';
import { safeProfile } from './schemas';
import { VoiceLinkCommerce } from './commerce';
import { voiceLinkProvider } from './provider';
import type { Checkout } from './checkout';

/** All remote recovery operations are GETs. Neither absence nor a timeout
 * authorizes another purchase, mapping, release, or client creation.
 */
export async function reconcileVoiceLinkCheckout(tenantId: string, deadline = Date.now() + 45000) {
  return withOperationLock(tenantId, async () => {
    const row = await queryOne<Checkout>("select * from voicelink_checkouts where tenant_id=$1 and state<>'expired'", [tenantId]);
    if (!row || row.state === 'assigned') return { state: row?.state ?? 'none', code: 'no_recovery_needed' };
    let code = 'operator_review_required';
    try {
      const account = await getAccount(tenantId, 'voicelink');
      if (!account?.provider_auth_id || !account.provider_account_id || account.id !== row.telephony_account_id)
        throw new HttpError(409, 'The original VoiceLink client must be recovered before this order.');
      const ref = { tenantId, authId: account.provider_auth_id, accountId: account.provider_account_id };
      // Authentication + parent/client pair verified even for draft recovery.
      await voiceLinkProvider.getCustomerAccount(ref);
      if (['creating','draft_unknown','quoted'].includes(row.state)) {
        if (row.provider_order_id && row.locked_monthly_minor !== null) {
          const quote = await new VoiceLinkCommerce().quote(row.provider_order_id, Number(row.locked_monthly_minor));
          // The original deadline is retained; polling never extends a lock.
          const updated = await queryOne<Checkout>(`update voicelink_checkouts set state='quoted',quote=$3,
            expires_at=coalesce(expires_at,created_at+interval '8 minutes'),recovery_checked_at=now(),
            recovery_code='draft_recovered',updated_at=now() where tenant_id=$1 and id=$2 returning *`, [tenantId,row.id,JSON.stringify(quote)]);
          const code = updated!.expires_at && Date.parse(updated!.expires_at) > Date.now() ? 'draft_recovered' : 'draft_expired';
          if(code==='draft_expired') await query('update voicelink_checkouts set recovery_code=$3 where tenant_id=$1 and id=$2',[tenantId,row.id,code]);
          return { state: updated!.state, code };
        }
        code = 'draft_reference_missing';
      } else if (['confirming','purchase_unknown','purchased','assignment_unknown'].includes(row.state)) {
        // Positive exact client ownership is sufficient to recover assignment,
        // but cannot prove the original purchase's price or enable service.
        let found = false;
        for (let page = 1; page <= 3; page++) {
          if (Date.now() > deadline - 32000) break;
          const owned = await voiceLinkProvider.listOwnedNumbers(ref, page);
          if (owned.items.some(item => item.id === row.provider_did_id && item.e164 === row.e164)) { found = true; break; }
          if (page * 100 >= owned.total) break;
        }
        if (found && row.phone_number_id) {
          await transaction(async client => {
            const number = await client.query(`select id from phone_numbers where tenant_id=$1 and id=$2
              and telephony_account_id=$3 and provider='voicelink' and provider_number_id=$4 and e164=$5
              and status not in ('released','releasing','active','suspended') for update`, [tenantId,row.phone_number_id,row.telephony_account_id,row.provider_did_id,row.e164]);
            if (!number.rows.length) throw new HttpError(409, 'The saved number reservation needs operator review.');
            await client.query(`update phone_numbers set status='configuring',provisioning_status='purchased',error_code=null,
              updated_at=now() where tenant_id=$1 and id=$2`, [tenantId,row.phone_number_id]);
            await client.query(`update voicelink_checkouts set state='assigned',recovery_checked_at=now(),
              recovery_code='ownership_confirmed',updated_at=now() where tenant_id=$1 and id=$2`, [tenantId,row.id]);
          });
          return { state: 'assigned', code: 'ownership_confirmed' };
        }
        code = 'ownership_unconfirmed';
      }
      await query('update voicelink_checkouts set recovery_checked_at=now(),recovery_code=$3 where tenant_id=$1 and id=$2', [tenantId,row.id,code]);
      return { state: row.state, code };
    } catch (error) {
      await query('update voicelink_checkouts set recovery_checked_at=now(),recovery_code=$3 where tenant_id=$1 and id=$2',
        [tenantId,row.id,error instanceof ProviderError ? error.code : 'operator_review_required']);
      throw error;
    }
  });
}

export async function reconcileVoiceLinkAccount(tenantId: string, client = new VoiceLinkClient()) {
  return withOperationLock(tenantId, async () => {
    const account = await queryOne<{ id: string; status: string; provider_username: string | null; provider_auth_id: string | null }>(
      "select id,status,provider_username,provider_auth_id from tenant_telephony_accounts where tenant_id=$1 and provider='voicelink'", [tenantId]);
    if (!account) throw new HttpError(404, 'VoiceLink account intent not found.');
    if (account.provider_auth_id) return { recovered: true };
    if (!account.provider_username || !['creating','needs_review'].includes(account.status))
      throw new HttpError(409, 'The original account has no saved correlation identifier. VoiceLink support must identify it before recovery.');
    const profile = safeProfile(await client.profile());
    const matches = (await client.clients()).filter(row => row.username === account.provider_username);
    if (matches.length !== 1) throw new HttpError(409, 'VoiceLink has not confirmed exactly one matching client. No new account will be created.');
    const candidate = matches[0];
    if (candidate.currency !== 'INR' || ![0,1].includes(Number(candidate.is_active))) throw new ProviderError('invalid_kyc_account');
    const id = providerId(candidate.id);
    // A globally unique provider/client constraint prevents adoption by two tenants.
    // Reset KYC observation; recovery itself never authorizes calls.
    await query(`update tenant_telephony_accounts set provider_auth_id=$3,provider_account_id=$4,status=$5,
      kyc_status='not_started',kyc_calls_blocked=true,document_states='{}',kyc_last_checked_at=null,
      kyc_verified_at=null,error_code=null,updated_at=now() where tenant_id=$1 and id=$2 and provider_auth_id is null`,
      [tenantId,account.id,id,`${profile.id}:${id}`,candidate.is_active === 1 ? 'active' : 'suspended']);
    return { recovered: true };
  });
}

/** Explicit platform-operator import for a client created in the provider portal.
 * Never called by self-service customer routes or inferred from a typed client ID.
 */
export async function linkExistingVoiceLinkClient(tenantId: string, clientId: unknown, client = new VoiceLinkClient()) {
  const id = providerId(clientId);
  await requireActiveTenant(tenantId);
  await requirePhoneSetupEligibility(tenantId);
  return withOperationLock(tenantId, async () => {
    const profile = safeProfile(await client.profile());
    if (!profile.active || !profile.verified) throw new HttpError(409, 'The reseller account needs verification.');
    const existing = await getAccount(tenantId, 'voicelink');
    if (existing) {
      if (existing.provider_auth_id === id && existing.provider_account_id === `${profile.id}:${id}`) return { linked: true };
      throw new HttpError(409, 'This workspace already has a VoiceLink account intent. Recover that original account instead.');
    }
    const matches = (await client.clients()).filter(row => providerId(row.id) === id);
    if (matches.length !== 1) throw new HttpError(409, 'That client is not uniquely owned by the configured reseller.');
    const candidate = matches[0];
    if (candidate.currency !== 'INR' || candidate.is_active !== 1 || typeof candidate.email !== 'string')
      throw new HttpError(409, 'The existing client must be active with valid INR account details.');
    const owner = await queryOne(`select m.user_id from tenant_memberships m join "user" u on u.id=m.user_id
      where m.tenant_id=$1 and m.role='owner' and lower(u.email)=lower($2) limit 1`, [tenantId, candidate.email.trim()]);
    if (!owner) throw new HttpError(409, 'The VoiceLink client email does not match a workspace owner.');
    const claimed = await queryOne('select tenant_id from tenant_telephony_accounts where provider=$1 and provider_auth_id=$2', ['voicelink', id]);
    if (claimed) throw new HttpError(409, 'That provider client is already linked to a workspace.');
    await query(`insert into tenant_telephony_accounts(tenant_id,provider,provider_auth_id,provider_account_id,provider_username,status)
      values($1,'voicelink',$2,$3,$4,'active')`, [tenantId,id,`${profile.id}:${id}`,typeof candidate.username === 'string' ? candidate.username : null]);
    // The insert starts KYC blocked. A subsequent fresh poll establishes status.
    // Import never changes wallets, channels, DID ownership or call activation.
    return { linked: true };
  });
}

/** Local closure only after an operator records provider/support confirmation.
 * Cannot abandon a paid/uncertain purchase or free a wallet hold.
 */
export async function closeVoiceLinkDraft(tenantId: string, reference: unknown, providerDraftClosed: unknown) {
  if (providerDraftClosed !== true || typeof reference !== 'string' || !/^[a-zA-Z0-9._:-]{3,100}$/.test(reference))
    throw new HttpError(400, 'Record the VoiceLink support reference and confirm the original draft is closed.');
  return withOperationLock(tenantId, async () => {
    const row = await queryOne<Checkout>("select * from voicelink_checkouts where tenant_id=$1 and state<>'expired'", [tenantId]);
    if (!row || row.phone_number_id || !['creating','draft_unknown','quoted'].includes(row.state))
      throw new HttpError(409, 'A paid or uncertain purchase cannot be closed as an unpaid draft.');
    await query(`update voicelink_checkouts set state='expired',recovery_checked_at=now(),
      recovery_code='operator_confirmed_draft_closed',updated_at=now() where tenant_id=$1 and id=$2`, [tenantId,row.id]);
  });
}
