import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { KnowledgeItem } from '@/types';
import { getKnowledge, getProfile } from '@/lib/store';

const MODEL =
  process.env.GEMINI_FLASH_MODEL ||
  process.env.GENAI_MODEL ||
  'gemini-3.8-flash';

const VALID_TYPES: KnowledgeItem['type'][] = ['text', 'link', 'pdf', 'image', 'doc', 'instruction'];

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface DraftItem {
  title: string;
  type: KnowledgeItem['type'];
  content: string;
  isActive: boolean;
}

const SYSTEM_PROMPT = `You are the knowledge-base editor for Nabeel's personal AI assistant.

Your task is to help Nabeel maintain two kinds of entries:

1. Normal factual knowledge ("text", "link", "pdf", "image", "doc") that is embedded and retrieved later via RAG.
2. Active instructions ("instruction") that are temporary, event-based, or current operational directions for calls. Active instructions are injected directly into the live voice assistant's system prompt and are NOT embedded.

CLASSIFICATION RULES

Classify the entry as "instruction" when the user is describing:
- temporary circumstances
- current status
- event-based behavior
- instructions for current calls
- time-sensitive behavior
- temporary availability
- conditional call handling
- phrases such as "today", "currently", "right now", "for the next few hours", "until I say otherwise", "tell callers...", "if someone calls...", "when someone asks..."

Examples that MUST classify as "instruction":
- "Nabeel is sleeping. Tell callers he is sleeping and will call after waking up."
- "Nabeel is in a meeting. Tell callers he is in a meeting."
- "For today, tell callers Nabeel is unavailable."
- "If someone calls about the project, tell them Nabeel will respond later."

Classify the entry as "text" for permanent, stable facts:
- "Nabeel is a software engineer."
- "Nabeel works on AI and software projects."
- "Nabeel is based in Kerala."

IMPORTANT:
- Do NOT infer temporary status if the user only provided a permanent fact.
- Do NOT invent expiration times, callback times, or facts.
- Preserve the meaning of the user's instruction.
- For newly created instructions set isActive to true.
- For normal knowledge set isActive to false (this value is behavioural metadata, not part of the content).
- Do not overwrite existing knowledge just because it looks similar; existing titles are context only.
- The reply should briefly acknowledge what was created.

Return ONLY valid JSON matching this structure:

{
  "reply": "Short acknowledgement to the user",
  "shouldSave": true,
  "draft": {
    "title": "Knowledge entry title",
    "type": "text",
    "content": "Clean factual content",
    "isActive": false
  }
}

If the user's message does not contain anything useful to store, return:

{
  "reply": "I understand.",
  "shouldSave": false,
  "draft": {
    "title": "",
    "type": "text",
    "content": "",
    "isActive": false
  }
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
      `Assistant owner: ${profile.name || 'Nabeel'}`,
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
            shouldSave: {
              type: 'boolean',
              description: 'True only when there is usable knowledge or an instruction to store.',
            },
            draft: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Short descriptive entry title.',
                },
                type: {
                  type: 'string',
                  enum: ['text', 'link', 'pdf', 'image', 'doc', 'instruction'],
                },
                content: {
                  type: 'string',
                  description: 'Clean content preserving the meaning of the input.',
                },
                isActive: {
                  type: 'boolean',
                  description: 'True for active instructions, false for normal knowledge.',
                },
              },
              required: ['title', 'type', 'content', 'isActive'],
            },
          },
          required: ['reply', 'shouldSave', 'draft'],
        },
      },
    });

    const raw = (response.text || '{}').replace(/```json|```/g, '').trim();
    let parsed: { reply?: string; shouldSave?: boolean; draft?: DraftItem | null };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ reply: raw || 'I could not process that.', shouldSave: false, draft: null });
    }

    // Validate/fallback server-side so a bad model response can never crash the
    // endpoint or store an unsupported type.
    const rawDraft = parsed.draft;
    const type: KnowledgeItem['type'] = VALID_TYPES.includes(rawDraft?.type as KnowledgeItem['type'])
      ? (rawDraft!.type as KnowledgeItem['type'])
      : 'text';
    const content = typeof rawDraft?.content === 'string' ? rawDraft.content.trim() : '';
    const title = typeof rawDraft?.title === 'string' && rawDraft.title.trim()
      ? rawDraft.title.trim()
      : 'Untitled entry';
    const shouldSave = parsed.shouldSave === true && content.length > 0;

    const draft: DraftItem = {
      title,
      type,
      content,
      isActive: type === 'instruction' ? rawDraft?.isActive !== false : false,
    };

    return NextResponse.json({
      reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply : 'Got it.',
      shouldSave,
      draft,
    });
  } catch (error) {
    console.error('Knowledge chat failed:', error);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
