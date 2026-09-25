import { NextResponse } from 'next/server';
import {
  getTenantGeminiApiKey,
  getTenantGeminiClient,
  getTenantTextModel,
} from '@/lib/gemini';
import { resolveTenantContext, handleApiError } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const { mimeType, data } = await request.json();
    if (!mimeType || !data || typeof data !== 'string') {
      return NextResponse.json({ error: 'mimeType and base64 data are required' }, { status: 400 });
    }

    // Tenant-scoped credential: never a platform-wide Gemini key.
    const apiKey = await getTenantGeminiApiKey(tenantId);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Add a Gemini API key in Settings → Providers before extracting files.' },
        { status: 503 },
      );
    }

    const ai = await getTenantGeminiClient(tenantId);
    const model = await getTenantTextModel(tenantId);
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType, data } },
          {
            text: `You are an expert business data extraction AI.
Analyze the provided file. Return STRICT JSON only:
{
  "knowledge_content": "Detailed, structured plain-text summary with services, products, pricing, hours, policies, and contacts.",
  "company_profile": {
    "name": "Business name or null",
    "industry": "Industry or null",
    "description": "Short description or null",
    "address": "Full address or null",
    "contactPhone": "Phone number or null",
    "contactEmail": "Email or null"
  }
}`,
          },
        ],
      },
    });

    const raw = (response.text || '{}').replace(/```json|```/g, '').trim();
    return NextResponse.json(JSON.parse(raw));
  } catch (error) {
    return handleApiError(error, 'Could not extract file content');
  }
}
