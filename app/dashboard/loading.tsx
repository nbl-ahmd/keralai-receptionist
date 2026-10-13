import { Skeleton } from '@/components/ui/skeleton';
export default function DashboardLoading() { return <div className="mx-auto max-w-5xl space-y-5 p-6" role="status" aria-label="Loading workspace"><Skeleton className="h-10 w-60"/><Skeleton className="h-28"/><Skeleton className="h-64"/></div>; }
