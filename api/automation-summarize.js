// /api/automation-summarize — long document → tight bullet summary
// that captures the actual content (not "this document discusses…"
// non-summaries). Inputs: raw text. Output: levelled summary the
// reader can scan in 60s.
import { callAnthropicStream, relayStream, parseJsonBody, requirePost } from './_lib/anthropic.js';
import { gateAndCharge } from './_lib/auth.js';

const SYSTEM = `You are a document summariser. Your output is read by people
who do not have time to read the original. They need to walk away knowing
what's actually inside it.

Rules:
  • Each bullet conveys a real fact, finding, claim, or recommendation
    from the source. No filler like "this document discusses X".
  • Quote a number, name, or date when the source gives one.
  • If the document has clear sections, mirror them in `sections`. If
    not, return a single section called "Overview".
  • Front-load the most important point. If the document is a proposal,
    state the proposal up front. If it's an analysis, state the
    conclusion up front.

Output ONLY valid JSON (no markdown, no fences):

{
  "tl_dr": "<3-line maximum summary anyone could read on a phone>",
  "sections": [
    { "title": "<section heading>", "bullets": ["<bullet>", "..."] }
  ],
  "key_numbers": [
    { "label": "<what the number measures>", "value": "<as quoted>" }
  ],
  "open_questions": ["<question the document raises but doesn't answer>"]
}`;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const payload = parseJsonBody(req);
  if (!payload) return res.status(400).json({ error: 'Invalid JSON body' });

  const doc = (payload.document || '').toString().trim();
  if (doc.length < 200)   return res.status(400).json({ error: 'Document too short to be worth summarising (under 200 chars).' });
  if (doc.length > 40000) return res.status(400).json({ error: 'Document too long. Trim to under 40,000 chars.' });

  const audience = (payload.audience || 'general operator').toString().trim();
  const length   = (payload.length   || 'medium').toString();

  const userPrompt = `Summarise the document below.

Audience: ${audience}
Length: ${length}  (short = 4-6 bullets total; medium = 8-12; long = full coverage)

DOCUMENT:
${doc}

Return only the JSON object per the schema.`;

  const gate = await gateAndCharge(req, 'nexus-4-5', 1);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, trace_id: gate.traceId });

  try {
    const upstream = await callAnthropicStream({ system: SYSTEM, userPrompt, maxTokens: 3500 });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'Upstream error', details: text.slice(0, 400) });
    }
    await relayStream(upstream, res);
  } catch (err) {
    if (err.code === 'NO_KEY') return res.status(500).json({ error: err.message });
    return res.status(500).json({ error: 'Summarisation failed.' });
  }
}
