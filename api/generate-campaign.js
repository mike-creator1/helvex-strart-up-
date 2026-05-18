// Vercel serverless function — generates email campaign drafts via the upstream AI.
//
// Required env: ANTHROPIC_API_KEY (set on Vercel → Project → Settings → Env Vars)
//
// Request:  POST /api/generate-campaign
//           Body: { brief, audience, goal, tone, language, variants }
//
// Response: Server-Sent Events stream. Forwards upstream streaming events
//           transparently to the client so the UI can render tokens as they
//           arrive (visible "AI is thinking" UX). Falls back to plain JSON
//           on upstream error.

import { relayStream } from './_lib/anthropic.js';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 3000;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are a senior email-marketing copywriter for premium B2B and B2C brands.

For every brief you receive, produce EXACTLY the number of variants the user asks for.
Each variant is a complete, self-contained email draft optimised for the requested goal
and audience. Vary the angle, hook, and CTA wording between variants so the user can
A/B test them — do not produce three near-duplicates.

Output ONLY a single valid JSON object, no markdown, no commentary, no code fences.
Schema:

{
  "variants": [
    {
      "id": "v1",
      "angle": "<one-line description of the angle used>",
      "subject": "<email subject — 6–9 words, earns the open>",
      "preview": "<preview/preheader text — under 90 characters, complements subject>",
      "body": "<full email body in plain text with line breaks. Skip 'Dear X' unless audience implies it. Open with a hook, deliver value in 2–4 short paragraphs, end with a single clear CTA paragraph. Use the requested language and tone.>",
      "cta": "<the call-to-action button label — 2–5 words, action verb>"
    }
  ]
}

Quality bar: subject lines must avoid spam triggers ("FREE", excessive !, ALL CAPS).
Body must feel hand-written, not generic AI copy — concrete details from the brief,
zero filler. Always write in the language the user specifies.`;

function buildUserPrompt({ brief, audience, goal, tone, language, variants }) {
  return `Generate ${variants || 3} distinct email variants in ${language || 'English'} for:

BRIEF:
${brief}

AUDIENCE: ${audience || 'general subscribers'}
GOAL: ${goal || 'drive engagement'}
TONE: ${tone || 'professional but warm'}

Return only the JSON object per the schema. No preamble, no markdown.`;
}

export default async function handler(req, res) {
  // Allow CORS for same-origin only (HelveX app is at swissupport-domain;
  // Vercel sets the right Origin automatically — we just lock POST).
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server not configured.',
    });
  }

  // Parse + validate input
  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const brief = (payload.brief || '').toString().trim();
  if (brief.length < 10) {
    return res.status(400).json({ error: 'Brief is too short. Give at least one sentence about what the email should say.' });
  }
  if (brief.length > 4000) {
    return res.status(400).json({ error: 'Brief is too long. Keep it under 4000 characters.' });
  }

  const variants = Math.min(Math.max(parseInt(payload.variants, 10) || 3, 1), 5);

  // Call upstream — streaming
  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: buildUserPrompt({ ...payload, variants }) },
        ],
        stream: true,
      }),
    });
  } catch (err) {
    console.error('[generate-campaign] fetch error:', err?.message || err);
    return res.status(502).json({ error: 'Could not reach HelveX AI. Try again in a few seconds.' });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    console.error('[generate-campaign] upstream not ok:', upstream.status, text.slice(0, 500));
    return res.status(upstream.status).json({
      error: `HelveX AI error (${upstream.status})`,
      details: text.slice(0, 500),
    });
  }

  // Forward the SSE stream via the shared sanitising relay (strips the
  // upstream model id from message_start / message_delta payloads).
  await relayStream(upstream, res);
}
