import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

const MODEL = process.env.GENAI_MODEL || 'gemini-flash-lite-latest';

export async function POST(request: Request) {
  try {
    const { mimeType, data } = await request.json();
    if (!mimeType || !data || typeof data !== 'string') {
      return NextResponse.json({ error: 'mimeType and base64 data are required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Server Gemini key is not configured' }, { status: 503 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
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
    console.error('[api/knowledge/extract] failed:', error);
    return NextResponse.json({ error: 'Could not extract file content' }, { status: 500 });
  }
}
