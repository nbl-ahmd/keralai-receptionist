import { Skeleton } from '@/components/ui/skeleton';
export default function AdminLoading() { return <div className="space-y-6" role="status" aria-label="Loading administration"><Skeleton className="h-12 w-64"/><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28"/><Skeleton className="h-28"/><Skeleton className="h-28"/></div><Skeleton className="h-72"/></div>; }
