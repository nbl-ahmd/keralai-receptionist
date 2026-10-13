import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { HttpError } from '@/lib/auth/context';
import { requirePlatformAdmin } from '@/lib/telephony/admin';
import AdminShell from '@/components/admin/AdminShell';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administration', robots: { index: false, follow: false } };
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const incoming = await headers();
  try {
    await requirePlatformAdmin(new Request(`${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/admin`, { headers: incoming }));
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect('/login?next=%2Fadmin');
    if (error instanceof HttpError && error.status === 403) notFound();
    throw error;
  }
  return <AdminShell>{children}</AdminShell>;
}
