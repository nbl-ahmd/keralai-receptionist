import { NextResponse } from 'next/server';
import { searchKnowledge } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ results: [] });
    }
    const results = await searchKnowledge(query, 3);
    return NextResponse.json({ results });
  } catch (error) {
    console.error('[api/knowledge/search] failed:', error);
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
  }
}