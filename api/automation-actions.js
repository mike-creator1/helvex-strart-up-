// /api/automation-actions — extract action items, decisions, and open
// questions from raw meeting notes / transcripts. Produces a clean
// list with owner + due date inferred from context where possible.
import { callAnthropicStream, relayStream, parseJsonBody, requirePost } from './_lib/anthropic.js';
import { gateAndCharge } from './_lib/auth.js';

const SYSTEM = `You are a meeting-notes parser.

Given raw notes or a transcript, extract:
  • Action items — concrete tasks with an owner (if mentioned) and a due
    date (if mentioned or inferable, ISO 8601 date).
  • Decisions — things the group concluded, not things still open.
  • Open questions — things that need follow-up before next time.

Rules:
  • Don't invent owners. If unclear, leave owner as null.
  • Don't invent dates. If "next week" is mentioned, return the actual
    ISO date for the upcoming Monday. If nothing is mentioned, null.
  • Skip filler ("good meeting", "thanks all", small talk).
  • Be specific: "Send the deck" not "Follow up on the deck stuff".

Output ONLY valid JSON (no markdown, no fences):

{
  "actions": [
    { "task": "<imperative sentence>", "owner": "<name or null>", "due": "<YYYY-MM-DD or null>", "priority": "high | medium | low" }
  ],
  "decisions": ["<short statement of what was decided>"],
  "open_questions": ["<unresolved question>"]
}

Use [] for any list with no items — never pad.`;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const payload = parseJsonBody(req);
  if (!payload) return res.status(400).json({ error: 'Invalid JSON body' });

  const notes = (payload.notes || '').toString().trim();
  if (notes.length < 40)    return res.status(400).json({ error: 'Paste the meeting notes (at least 40 chars).' });
  if (notes.length > 20000) return res.status(400).json({ error: 'Notes too long. Trim to under 20,000 chars.' });

  const today = (payload.today || new Date().toISOString().slice(0, 10));
  const participants = (payload.participants || '').toString().trim();

  const userPrompt = `Today's date: ${today}
${participants ? `Participants (names → use exactly these when assigning owners): ${participants}` : ''}

NOTES:
${notes}

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
    return res.status(500).json({ error: 'Action extraction failed.' });
  }
}
