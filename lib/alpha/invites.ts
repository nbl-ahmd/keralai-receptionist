import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, queryOne } from '@/db/client';
import { transaction } from '@/db/transaction';
import { HttpError } from '@/lib/auth/context';
export const inviteHash = (raw: string) => createHash('sha256').update(raw).digest('hex');
export function validInviteToken(raw: unknown): raw is string { return typeof raw === 'string' && /^[A-Za-z0-9_-]{43}$/.test(raw); }
export async function inviteRateLimit(subject: string, operation = 'invite', limit = 20) {
 const rows = await query(`insert into alpha_rate_limits(subject_hash,operation,window_start)
 values($1,$2,date_trunc('minute',now())) on conflict(subject_hash,operation,window_start)
 do update set requests=alpha_rate_limits.requests+1 where alpha_rate_limits.requests<$3 returning requests`,[inviteHash(subject),operation,limit]);
 if (!rows.length) throw new HttpError(429,'Too many attempts. Please wait a minute.');
}
export async function inspectInvite(raw: unknown, email?: string) {
 if (!validInviteToken(raw)) throw new HttpError(403,'This invitation is invalid or unavailable.');
 const row=await queryOne<{id:string;email:string|null}>(`select id,email from alpha_invites where code_hash=$1
 and status='active' and expires_at>now() and uses<max_uses`,[inviteHash(raw)]);
 if (!row || (email && row.email && row.email !== email.trim().toLowerCase())) throw new HttpError(403,'This invitation is invalid or unavailable for this email.');
 return row;
}
export async function createInvite(actorId:string,input:{email?:string;maxUses?:number;expiresInDays?:number;reason?:string;reference?:string}) {
 const email=input.email?.trim().toLowerCase() || null;
 const uses=input.maxUses??1,days=input.expiresInDays??7,reason=input.reason?.trim();
 if ((email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !Number.isInteger(uses) || uses<1 || uses>100 || !Number.isInteger(days) || days<1 || days>30 || !reason || reason.length>500) throw new HttpError(400,'Invalid invitation settings or reason.');
 if (process.env.ALPHA_INVITE_ISSUANCE_ENABLED!=='1') throw new HttpError(403,'New invitations are disabled.');
 const token=randomBytes(32).toString('base64url');
 const id=await transaction(async c=>{
  const result=await c.query(`insert into alpha_invites(code_hash,email,created_by,max_uses,expires_at)
   values($1,$2,$3,$4,now()+$5*interval '1 day') returning id`,[inviteHash(token),email,actorId,uses,days]);
  await c.query(`insert into alpha_operator_events(actor_id,action,resource_id,reason,reference) values($1,'alpha.invite.created',$2,$3,$4)`,[actorId,result.rows[0].id,reason,input.reference?.slice(0,100)??result.rows[0].id]);
  return result.rows[0].id as string;
 });
 console.info(JSON.stringify({event:'alpha.invite.created',resourceId:id}));
 return {id,token}; // Raw token returned once; never stored or logged.
}
export async function lockInvite(c:PoolClient,raw:string,email:string) {
 if(!validInviteToken(raw))throw new HttpError(403,'An active invitation is required.');
 const result=await c.query(`select * from alpha_invites where code_hash=$1 and status='active'
 and expires_at>now() and uses<max_uses for update`,[inviteHash(raw)]);
 const row=result.rows[0];
 if(!row || (row.email && row.email!==email.toLowerCase()))throw new HttpError(403,'This invitation is invalid or unavailable for this email.');
 return row;
}
export async function provisionInvitedTenant(c:PoolClient,user:{id:string;name:string},inviteId:string) {
 const tenant=await c.query(`insert into tenants(name,slug) values($1,$2) returning id`,[user.name.slice(0,80),`alpha-${randomBytes(12).toString('hex')}`]);
 const tid=tenant.rows[0].id;
 await c.query(`insert into tenant_memberships(tenant_id,user_id,role) values($1,$2,'owner')`,[tid,user.id]);
 await c.query('insert into company_profile(tenant_id) values($1)',[tid]);
 await c.query('insert into tenant_onboarding(tenant_id) values($1)',[tid]);
 await c.query('insert into tenant_runtime_state(tenant_id) values($1)',[tid]);
 await c.query("insert into tenant_ai_configuration(tenant_id,credential_mode) values($1,'platform_managed')",[tid]);
 const plan=await c.query("select entitlements from plans where code='alpha' and active=true for share");
 if(!plan.rows[0])throw new HttpError(503,'Alpha plan is unavailable.');
 await c.query("insert into tenant_subscriptions(tenant_id,plan_code) values($1,'alpha')",[tid]);
 await c.query('insert into wallet_accounts(tenant_id) values($1)',[tid]);
 const amount=Number(plan.rows[0].entitlements.promo_credit_minor);
 if(!Number.isSafeInteger(amount)||amount<0)throw new HttpError(503,'Alpha credit configuration is invalid.');
 if(amount>0)await c.query(`insert into wallet_transactions(tenant_id,type,amount_minor,reference_type,reference_id,idempotency_key)
 values($1,'promotional_credit',$2,'alpha_invite',$3,$4)`,[tid,amount,inviteId,`alpha-activation:${tid}`]);
 await c.query('insert into alpha_invite_redemptions(invite_id,user_id,tenant_id) values($1,$2,$3)',[inviteId,user.id,tid]);
 await c.query("update alpha_invites set uses=uses+1,used_at=now(),status=case when uses+1=max_uses then 'consumed' else status end where id=$1",[inviteId]);
 return tid as string;
}
