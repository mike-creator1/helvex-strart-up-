// /api/automation-digest — turn a wall of separate notes / messages /
// updates / commits into one clean digest the user can read in 30s.
// Same pattern as automation-reply: streams JSON back, sanitised by
// the relayStream helper so no upstream model name leaks.
import { callAnthropicStream, relayStream, parseJsonBody, requirePost } from './_lib/anthropic.js';
import { gateAndCharge } from './_lib/auth.js';

const SYSTEM = `You are a digest writer for a busy operator.

Given a batch of separate items (emails, slack messages, commits, notes,
calendar events — anything), produce a single digest that lets the reader
catch up in under a minute.

Rules:
  • Group by theme, not by source.
  • Lead with what changed or what needs attention.
  • Strip filler ("Just wanted to follow up…", "Hope you're well").
  • Surface deadlines, decisions made, blockers, and open questions.
  • Match the user's requested tone and length.

Output ONLY valid JSON (no markdown, no fences):

{
  "headline": "<one sentence: the most important thing in the whole batch>",
  "sections": [
    { "title": "<theme>", "bullets": ["<bullet>", "..."] }
  ],
  "needs_response": [
    { "from": "<sender or source>", "ask": "<what they're asking for>", "by": "<deadline if any, else null>" }
  ],
  "blockers": ["<short description of any blocker>"]
}

Use [] for any section that has no items — never invent bullets.`;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const payload = parseJsonBody(req);
  if (!payload) return res.status(400).json({ error: 'Invalid JSON body' });

  const items = (payload.items || '').toString().trim();
  if (items.length < 40)   return res.status(400).json({ error: 'Paste the batch you want digested (at least 40 chars).' });
  if (items.length > 15000) return res.status(400).json({ error: 'Batch too long. Trim to under 15,000 chars.' });

  const tone   = payload.tone   || 'neutral and direct';
  const length = payload.length || 'medium';

  const userPrompt = `Build a digest from the items below.

Tone: ${tone}
Length: ${length}  (short = max 5 bullets per section; medium = up to 8; long = full coverage)

ITEMS:
${items}

Return only the JSON object per the schema.`;

  const gate = await gateAndCharge(req, 'nexus-4-5', 1);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, trace_id: gate.traceId });

  try {
    const upstream = await callAnthropicStream({ system: SYSTEM, userPrompt, maxTokens: 2500 });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'Upstream error', details: text.slice(0, 400) });
    }
    await relayStream(upstream, res);
  } catch (err) {
    if (err.code === 'NO_KEY') return res.status(500).json({ error: err.message });
    return res.status(500).json({ error: 'Digest generation failed.' });
  }
}
