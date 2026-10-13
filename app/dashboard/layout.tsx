import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveTenantContext } from '@/lib/auth/context';
import { queryOne } from '@/db/client';
import { WorkspaceAccessProvider } from '@/components/app/WorkspaceAccess';
import { isPlatformAdminUserId } from '@/lib/auth/platform-admin';
export const dynamic = 'force-dynamic';
export default async function DashboardLayout({children}:{children:React.ReactNode}) {
  const incoming=await headers();
  const request=new Request((process.env.BETTER_AUTH_URL ?? 'http://localhost:3000')+'/dashboard',{headers:incoming});
  let context: Awaited<ReturnType<typeof resolveTenantContext>>;
  try { context=await resolveTenantContext(request); } catch {redirect('/login');}
  const {tenantId,userId}=context;
  const state=await queryOne<{step:string}>('select step from tenant_onboarding where tenant_id=$1',[tenantId]);
  const path=incoming.get('x-keralai-pathname');
  if(state?.step!=='complete' && path!=='/dashboard/admin' && path!=='/dashboard/onboarding' && path!=='/dashboard/phone' && path!=='/dashboard/settings' && path!=='/dashboard/advanced' && path!=='/dashboard/assistant') redirect('/dashboard/onboarding');
  return <WorkspaceAccessProvider value={{userId,tenantId,isAdmin:isPlatformAdminUserId(userId)}}>{children}</WorkspaceAccessProvider>;
}
