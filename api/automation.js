// /api/automation — single Hobby-friendly entry point for every
// Automation tool. Routes by `kind` in the JSON body to keep the
// project under Vercel's 12-functions-per-deploy ceiling.
//
//   kind: 'reply'      → inbox triage + draft reply  (old: automation-reply)
//   kind: 'digest'     → batch of items → digest    (old: automation-digest)
//   kind: 'actions'    → meeting notes → actions    (old: automation-actions)
//   kind: 'summarize'  → long doc → summary         (old: automation-summarize)
//
// Each kind has its own system prompt + validation, but all share the
// same stream-relay + credit-gate plumbing.

import { callAnthropicStream, relayStream, parseJsonBody, requirePost } from './_lib/anthropic.js';
import { gateAndCharge } from './_lib/auth.js';

// ─────────────────────────────────────────────────────────────────
// Tool definitions — each entry knows its system prompt, how to read
// inputs into a userPrompt, and the max-tokens budget.
// Keep these inline so the router stays a single file (one function).
// ─────────────────────────────────────────────────────────────────
const TOOLS = {
  reply: {
    maxTokens: 2000,
    system: `You are an inbox automation analyst. You read an incoming email and produce
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
}`,
    build(body) {
      const incoming = (body.email || '').toString().trim();
      if (incoming.length < 20)   return { error: 'Paste the full incoming email (at least 20 chars).', status: 400 };
      if (incoming.length > 8000) return { error: 'Email too long. Trim to under 8000 chars.', status: 400 };
      const tone     = body.tone     || 'professional but warm';
      const language = body.language || 'same as sender';
      const context  = (body.context || '').toString().trim();
      return { userPrompt: `Triage this incoming email and draft a reply.

Reply tone: ${tone}
Reply language: ${language}
${context ? `Additional context the user gave: ${context}` : ''}

INCOMING EMAIL:
${incoming}

Return only the JSON object per the schema.` };
    },
  },

  digest: {
    maxTokens: 2500,
    system: `You are a digest writer for a busy operator.

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

Use [] for any section that has no items — never invent bullets.`,
    build(body) {
      const items = (body.items || '').toString().trim();
      if (items.length < 40)    return { error: 'Paste the batch you want digested (at least 40 chars).', status: 400 };
      if (items.length > 15000) return { error: 'Batch too long. Trim to under 15,000 chars.', status: 400 };
      const tone   = body.tone   || 'neutral and direct';
      const length = body.length || 'medium';
      return { userPrompt: `Build a digest from the items below.

Tone: ${tone}
Length: ${length}  (short = max 5 bullets per section; medium = up to 8; long = full coverage)

ITEMS:
${items}

Return only the JSON object per the schema.` };
    },
  },

  actions: {
    maxTokens: 2500,
    system: `You are a meeting-notes parser.

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

Use [] for any list with no items — never pad.`,
    build(body) {
      const notes = (body.notes || '').toString().trim();
      if (notes.length < 40)    return { error: 'Paste the meeting notes (at least 40 chars).', status: 400 };
      if (notes.length > 20000) return { error: 'Notes too long. Trim to under 20,000 chars.', status: 400 };
      const today = body.today || new Date().toISOString().slice(0, 10);
      const participants = (body.participants || '').toString().trim();
      return { userPrompt: `Today's date: ${today}
${participants ? `Participants (names → use exactly these when assigning owners): ${participants}` : ''}

NOTES:
${notes}

Return only the JSON object per the schema.` };
    },
  },

  summarize: {
    maxTokens: 3500,
    system: `You are a document summariser. Your output is read by people
who do not have time to read the original. They need to walk away knowing
what's actually inside it.

Rules:
  • Each bullet conveys a real fact, finding, claim, or recommendation
    from the source. No filler like "this document discusses X".
  • Quote a number, name, or date when the source gives one.
  • If the document has clear sections, mirror them in \`sections\`. If
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
}`,
    build(body) {
      const doc = (body.document || '').toString().trim();
      if (doc.length < 200)   return { error: 'Document too short to be worth summarising (under 200 chars).', status: 400 };
      if (doc.length > 40000) return { error: 'Document too long. Trim to under 40,000 chars.', status: 400 };
      const audience = (body.audience || 'general operator').toString().trim();
      const length   = (body.length   || 'medium').toString();
      return { userPrompt: `Summarise the document below.

Audience: ${audience}
Length: ${length}  (short = 4-6 bullets total; medium = 8-12; long = full coverage)

DOCUMENT:
${doc}

Return only the JSON object per the schema.` };
    },
  },
};

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const body = parseJsonBody(req);
  if (!body) return res.status(400).json({ error: 'Invalid JSON body' });

  const kind = (body.kind || '').toString().toLowerCase();
  const tool = TOOLS[kind];
  if (!tool) return res.status(400).json({ error: `Unknown kind "${kind}". Use one of: ${Object.keys(TOOLS).join(', ')}.` });

  const built = tool.build(body);
  if (built.error) return res.status(built.status || 400).json({ error: built.error });

  const gate = await gateAndCharge(req, 'nexus-4-5', 1);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, trace_id: gate.traceId });

  try {
    const upstream = await callAnthropicStream({
      system: tool.system,
      userPrompt: built.userPrompt,
      maxTokens: tool.maxTokens,
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'Upstream error', details: text.slice(0, 400) });
    }
    await relayStream(upstream, res);
  } catch (err) {
    if (err.code === 'NO_KEY') return res.status(500).json({ error: err.message });
    return res.status(500).json({ error: `${kind} failed.` });
  }
}
