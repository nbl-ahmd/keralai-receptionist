import { NextResponse } from 'next/server';
import { KnowledgeItem } from '@/types';
import {
  getKnowledge,
  reindexKnowledgeItem,
  removeKnowledgeItem,
  upsertKnowledgeItem,
} from '@/lib/store';

export async function GET() {
  try {
    return NextResponse.json(await getKnowledge());
  } catch (error) {
    console.error('[api/knowledge] GET failed:', error);
    return NextResponse.json({ error: 'Failed to read knowledge base' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const item = (await request.json()) as KnowledgeItem;
    if (!item?.title || !item?.content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    const saved = await upsertKnowledgeItem(item);

    try {
      const embeddings = await reindexKnowledgeItem(saved);
      return NextResponse.json({ success: true, item: saved, indexed: embeddings.length });
    } catch (error) {
      console.error('[api/knowledge] Embedding generation failed:', error);
      return NextResponse.json(
        { success: true, item: saved, indexed: 0, warning: 'Saved without embeddings' },
        { status: 207 },
      );
    }
  } catch (error) {
    console.error('[api/knowledge] POST failed:', error);
    return NextResponse.json({ error: 'Failed to save item' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    await removeKnowledgeItem(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/knowledge] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}