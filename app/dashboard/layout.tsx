import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveTenantContext } from '@/lib/auth/context';
import { queryOne } from '@/db/client';
export const dynamic = 'force-dynamic';
export default async function DashboardLayout({children}:{children:React.ReactNode}) {
  const incoming=await headers();
  const request=new Request((process.env.BETTER_AUTH_URL ?? 'http://localhost:3000')+'/dashboard',{headers:incoming});
  let tenantId:string;
  try { tenantId=(await resolveTenantContext(request)).tenantId; } catch {redirect('/login');}
  const state=await queryOne<{step:string}>('select step from tenant_onboarding where tenant_id=$1',[tenantId]);
  const path=incoming.get('x-keralai-pathname');
  if(state?.step!=='complete' && path!=='/dashboard/onboarding' && path!=='/dashboard/phone' && path!=='/dashboard/settings' && path!=='/dashboard/advanced' && path!=='/dashboard/assistant') redirect('/dashboard/onboarding');
  return children;
}
