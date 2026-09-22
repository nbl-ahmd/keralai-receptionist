import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { KnowledgeItem } from '@/types';
import { getKnowledge, getProfile } from '@/lib/store';

const MODEL = process.env.GENAI_MODEL || 'gemini-flash-lite-latest';

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface DraftItem {
  title: string;
  type: KnowledgeItem['type'];
  content: string;
}

const SYSTEM_PROMPT = `You are the knowledge curator for an AI phone receptionist.
The user will describe business information in plain language (pricing, hours, policies, services, FAQs).
Your job:
1. Reply with a short, friendly confirmation of what you understood.
2. Produce a clean, self-contained knowledge entry that the receptionist can use verbatim.

Return STRICT JSON only, no markdown fences:
{
  "reply": "short conversational confirmation",
  "draft": {
    "title": "concise title",
    "type": "text",
    "content": "well-structured plain text, no markdown symbols"
  }
}
If the user is only asking a question and not providing new information, set "draft" to null and answer in "reply".`;

export async function POST(request: Request) {
  try {
    const { message, history } = (await request.json()) as {
      message?: string;
      history?: ChatTurn[];
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
    }

    const profile = await getProfile();
    const existing = await getKnowledge();
    const context = [
      `Company: ${profile.name || 'Unknown'} (${profile.industry || 'general'})`,
      `Existing knowledge titles: ${existing.map((item) => item.title).join(', ') || 'none'}`,
    ].join('\n');

    const conversation = (history ?? [])
      .slice(-8)
      .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`)
      .join('\n');

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: {
        parts: [
          { text: `${SYSTEM_PROMPT}\n\nCONTEXT:\n${context}\n\nCONVERSATION:\n${conversation}\nUser: ${message}` },
        ],
      },
    });

    const raw = (response.text || '{}').replace(/```json|```/g, '').trim();
    let parsed: { reply?: string; draft?: DraftItem | null };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ reply: raw || 'I could not process that.', draft: null });
    }

    const draft = parsed.draft && parsed.draft.content
      ? {
          title: parsed.draft.title || 'Untitled entry',
          type: (parsed.draft.type || 'text') as KnowledgeItem['type'],
          content: parsed.draft.content,
        }
      : null;

    return NextResponse.json({
      reply: parsed.reply || 'Got it.',
      draft,
    });
  } catch (error) {
    console.error('Knowledge chat failed:', error);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}