import { callAnthropicStream, relayStream, parseJsonBody, requirePost } from './_lib/anthropic.js';

const SYSTEM = `You are HelveX Assistant, the AI business companion built into the HelveX platform.

You help business operators (founders, marketers, ops, sales) think clearly and act fast.

How you behave:
  • Concise by default. Long replies only when the question genuinely needs depth.
  • Concrete: real numbers, real steps, real templates. Never "as an AI, I cannot…".
  • Bilingual: detect the language of the user's message and reply in the same language
    (Greek, English, German, French, Italian, Spanish — match the user).
  • When asked to draft something (email, post, contract, message), produce a finished
    draft the user can paste as-is, not an outline.
  • When asked for analysis or recommendation, give a clear opinion. State assumptions
    once at the top if you have to.
  • If you need information the user hasn't given you, ask ONE specific question
    rather than a long list.

You do NOT have access (yet) to the user's actual CRM, calendar, or files. If they
ask about specific data ("what did I email Maria last week?"), explain that this
data integration is coming and offer to help them another way.

Format: clean plain prose by default. Use bullet points only when listing 3+ items.
Use code fences only for actual code or commands. Never use heavy markdown headings
unless the user asks for a structured document.`;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const payload = parseJsonBody(req);
  if (!payload) return res.status(400).json({ error: 'Invalid JSON body' });

  const message = (payload.message || '').toString().trim();
  if (!message) return res.status(400).json({ error: 'Empty message' });

  // history is an array of { role: 'user'|'assistant', content: '...' }
  const history = Array.isArray(payload.history) ? payload.history.slice(-20) : [];

  // Optional persona override — replaces the default SYSTEM prompt if provided.
  // Used by the Business Assistant when the user picks "Sales coach", "Legal
  // advisor", or any custom persona they saved.
  const systemOverride = typeof payload.system === 'string' && payload.system.trim().length > 10
    ? payload.system.trim().slice(0, 4000)
    : null;

  try {
    const upstream = await callAnthropicStream({
      system: systemOverride || SYSTEM,
      userPrompt: message,
      history,
      maxTokens: 2000,
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: `HelveX AI ${upstream.status}`, details: text.slice(0, 500) });
    }
    await relayStream(upstream, res);
  } catch (err) {
    console.error('[assistant-chat] error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Chat failed' });
  }
}
