import { NextResponse } from 'next/server';
import { KnowledgeItem } from '@/types';
import {
  getKnowledge,
  reindexKnowledgeItem,
  removeKnowledgeItem,
  upsertKnowledgeItem,
} from '@/lib/store';
import { resolveTenantContext, handleApiError } from '@/lib/auth/context';

export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    return NextResponse.json(await getKnowledge(tenantId));
  } catch (error) {
    return handleApiError(error, 'Failed to read knowledge base');
  }
}

const VALID_TYPES = new Set<KnowledgeItem['type']>([
  'text',
  'link',
  'pdf',
  'image',
  'doc',
  'instruction',
]);

export async function POST(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const item = (await request.json()) as KnowledgeItem;
    if (!item?.title || !item?.content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }
    if (!VALID_TYPES.has(item.type)) {
      return NextResponse.json({ error: 'Unsupported knowledge type' }, { status: 400 });
    }

    const saved = await upsertKnowledgeItem(tenantId, item);
    const activeInstruction = saved.type === 'instruction' && saved.isActive !== false;

    try {
      const embeddings = await reindexKnowledgeItem(tenantId, saved);
      return NextResponse.json({
        success: true,
        item: saved,
        indexed: embeddings.length,
        activeInstruction,
      });
    } catch (error) {
      // Instructions are never embedded, so their save must never fail on
      // embedding. Normal knowledge keeps the existing 207 warning behaviour.
      if (saved.type === 'instruction') {
        return NextResponse.json({
          success: true,
          item: saved,
          indexed: 0,
          activeInstruction,
        });
      }
      console.error('[api/knowledge] Embedding generation failed:', error);
      return NextResponse.json(
        { success: true, item: saved, indexed: 0, activeInstruction, warning: 'Saved without embeddings' },
        { status: 207 },
      );
    }
  } catch (error) {
    return handleApiError(error, 'Failed to save item');
  }
}

export async function DELETE(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    await removeKnowledgeItem(tenantId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete item');
  }
}
