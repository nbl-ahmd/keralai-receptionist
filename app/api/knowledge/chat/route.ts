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

const SYSTEM_PROMPT = `You are a knowledge-base editor for Nabeel's personal AI assistant.

Your task is to help Nabeel create and maintain factual knowledge entries that the phone assistant can use.

The user is providing information, instructions, facts, preferences, contact details, or other approved information about Nabeel.

Transform the user's input into a concise, useful knowledge-base entry.

Rules:

1. Preserve the meaning of the user's information.
2. Do not invent facts.
3. Do not add assumptions.
4. Do not create information that was not provided.
5. Remove conversational filler.
6. Prefer clear factual wording.
7. Create a useful title.
8. Use type "text" unless the content clearly represents another supported knowledge type.
9. The knowledge content should be suitable for retrieval by a voice assistant.
10. Do not include private system instructions or API credentials.
11. Existing knowledge is provided only as context. Do not overwrite or contradict it unless the user explicitly gives updated information.
12. The reply should briefly acknowledge what was created.

Return ONLY valid JSON matching this structure:

{
  "reply": "Short acknowledgement to the user",
  "draft": {
    "title": "Knowledge entry title",
    "type": "text",
    "content": "Clean factual knowledge content"
  }
}

If the user's message does not contain useful knowledge to store, return:

{
  "reply": "I understand.",
  "draft": null
}`;

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
      {
        text: `${SYSTEM_PROMPT}

CONTEXT:
${context}

CONVERSATION:
${conversation}

User:
${message}`,
      },
    ],
  },
  config: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        reply: {
          type: 'string',
          description: 'Short conversational acknowledgement.',
        },
        draft: {
          type: ['object', 'null'],
          properties: {
            title: {
              type: 'string',
              description: 'Short descriptive knowledge entry title.',
            },
            type: {
              type: 'string',
              enum: ['text', 'link', 'pdf', 'image', 'doc'],
            },
            content: {
              type: 'string',
              description: 'Clean factual knowledge content suitable for retrieval.',
            },
          },
          required: ['title', 'type', 'content'],
        },
      },
      required: ['reply', 'draft'],
    },
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