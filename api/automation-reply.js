import { callAnthropicStream, relayStream, parseJsonBody, requirePost } from './_lib/anthropic.js';
import { gateAndCharge } from './_lib/auth.js';

const SYSTEM = `You are an inbox automation analyst. You read an incoming email and produce
a triage + suggested reply that a human can approve in one click.

You classify the email's intent and urgency, then draft a reply that matches:
  • the original tone of the sender (formal vs casual)
  • the user's preferred reply tone (passed in)
  • the user's preferred language (passed in, default = same language as the sender)

If the email is spam, automated noise (out-of-office, no-reply), or doesn't actually
need a reply, say so in "recommendation" and leave "draft_reply" empty.

If the email asks for information the user might not want to share automatically
(pricing, contract terms, internal data), flag in "warnings" before the user sends.

Output ONLY valid JSON (no markdown, no fences):

{
  "summary": "<one-line summary of what the sender wants>",
  "intent": "support | sales_lead | partnership | complaint | scheduling | thanks | spam | newsletter | internal | other",
  "urgency": "high | medium | low",
  "sentiment": "positive | neutral | negative",
  "recommendation": "reply | snooze | archive | escalate | mark_spam",
  "draft_reply": {
    "subject": "Re: <original subject>",
    "body": "<full email body in plain text — ready to send. Open with greeting matching sender's formality, address the actual question, close with a clear next step. Skip generic 'Hope this helps' filler.>"
  },
  "warnings": ["..."]
}`;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const payload = parseJsonBody(req);
  if (!payload) return res.status(400).json({ error: 'Invalid JSON body' });

  const incoming = (payload.email || '').toString().trim();
  if (incoming.length < 20) return res.status(400).json({ error: 'Paste the full incoming email (at least 20 chars).' });
  if (incoming.length > 8000) return res.status(400).json({ error: 'Email too long. Trim to under 8000 chars.' });

  const tone     = payload.tone     || 'professional but warm';
  const language = payload.language || 'same as sender';
  const context  = (payload.context || '').toString().trim();

  const userPrompt = `Triage this incoming email and draft a reply.

Reply tone: ${tone}
Reply language: ${language}
${context ? `Additional context the user gave: ${context}` : ''}

INCOMING EMAIL:
${incoming}

Return only the JSON object per the schema.`;

  const gate = await gateAndCharge(req, 'nexus-4-5', 1);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, trace_id: gate.traceId });

  try {
    const upstream = await callAnthropicStream({ system: SYSTEM, userPrompt, maxTokens: 2000 });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: `HelveX AI ${upstream.status}`, details: text.slice(0, 500) });
    }
    await relayStream(upstream, res);
  } catch (err) {
    console.error('[automation-reply] error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Reply draft failed' });
  }
}
