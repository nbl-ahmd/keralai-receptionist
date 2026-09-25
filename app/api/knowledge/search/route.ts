import { NextResponse } from 'next/server';
import { searchKnowledge } from '@/lib/store';
import { resolveTenantContext, handleApiError } from '@/lib/auth/context';

export async function POST(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const { query } = await request.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ results: [] });
    }
    const results = await searchKnowledge(tenantId, query, 3);
    return NextResponse.json({ results });
  } catch (error) {
    return handleApiError(error, 'Failed to search');
  }
}
