import { callAnthropicStream, relayStream, parseJsonBody, requirePost } from './_lib/anthropic.js';

const SYSTEM = `You are a B2B sales-intelligence analyst. Given a contact's email + optional
name + optional notes, you produce a structured enrichment profile that a salesperson
can use to write a personalised outreach message.

Inference rules:
  • From the email domain: identify the company, guess industry, size band, and
    seniority IF the name + role pattern in the local-part imply it.
  • From the name: infer likely seniority (e.g. firstname.lastname@bigcorp.com is
    usually staff-level; firstname@startup.com is often a founder/early hire).
  • Mark every inferred field with a confidence level: high / medium / low.
  • Do NOT make up specific facts (no fake LinkedIn URL, no fake company description
    you can't actually verify). If you don't know, say so.
  • The conversation_starter should be ONE sentence the salesperson can open with —
    relevant to the inferred company/industry.

Output ONLY valid JSON (no markdown, no fences):

{
  "company": { "name": "...", "domain": "...", "confidence": "high|medium|low" },
  "industry": { "value": "...", "confidence": "..." },
  "size_band": { "value": "1-10 | 11-50 | 51-200 | 201-1000 | 1001+", "confidence": "..." },
  "person": {
    "name": "...",
    "likely_seniority": "founder | exec | director | manager | individual | unknown",
    "likely_function": "engineering | product | sales | marketing | operations | finance | hr | other | unknown",
    "confidence": "..."
  },
  "signals": ["...", "..."],
  "conversation_starter": "...",
  "outreach_angle": "...",
  "warnings": ["..."]
}`;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const payload = parseJsonBody(req);
  if (!payload) return res.status(400).json({ error: 'Invalid JSON body' });

  const email = (payload.email || '').toString().trim().toLowerCase();
  if (!email.includes('@') || email.length < 5) {
    return res.status(400).json({ error: 'Provide a valid email address' });
  }
  const name  = (payload.name  || '').toString().trim();
  const notes = (payload.notes || '').toString().trim();

  const userPrompt = `Enrich this contact:

Email: ${email}
${name  ? `Name: ${name}` : ''}
${notes ? `Notes: ${notes}` : ''}

Return only the JSON profile per the schema. Mark confidence honestly.`;

  try {
    const upstream = await callAnthropicStream({ system: SYSTEM, userPrompt, maxTokens: 1500 });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: `Claude API ${upstream.status}`, details: text.slice(0, 500) });
    }
    await relayStream(upstream, res);
  } catch (err) {
    console.error('[crm-enrich] error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Enrichment failed' });
  }
}
