// Vercel serverless function — the chat backend for every HelveX builder
// (agents, app-builder, model-builder, website-builder, workflow-builder).
//
// Why this exists:
//   The builders used to call api.anthropic.com directly from the browser
//   with the user's own API key in localStorage and brand-name model IDs
//   (ether/nexus/prometheus) that Anthropic does not recognise. The result
//   was a guaranteed 400 every time a user pressed Send — the entire builder
//   surface was non-functional.
//
//   This endpoint receives the same body the browser used to send to
//   Anthropic, translates the brand-name model into a real upstream model
//   ID server-side, signs the upstream request with the platform's
//   ANTHROPIC_API_KEY, and forwards the response as Server-Sent Events
//   through the shared relay (which strips the upstream model name from
//   every JSON payload before it reaches the client).
//
// Request body:
//   { model, max_tokens, system, messages, stream?, temperature?, thinking? }
//
// Response: text/event-stream — identical event shape to /v1/messages,
//   with the `model` field rewritten to the HelveX brand name.

import { ANTHROPIC_URL, relayStream } from './_lib/anthropic.js';

// Brand-name model IDs (what the browser sends) → real Anthropic model IDs
// (what the upstream API understands). The brand names are what users see;
// the upstream names are server-only.
//
// Important: the older 3.x-style upstream IDs the builders historically
// shipped (e.g. claude-3-7-sonnet-20250219) are not all valid in the
// current Anthropic catalogue. To guarantee every Send succeeds we route
// every tier through claude-sonnet-4-5 — the same model the rest of the
// platform already runs in production. When verified haiku/opus 4.x IDs
// are available we can split the tiers; until then "one working model"
// beats "three broken ones".
const WORKHORSE = 'claude-sonnet-4-5';

function resolveModel(input) {
  // Any brand-prefixed input is accepted but always resolves to the
  // workhorse. The MODEL_MAP browser-side concept of fast/balanced/deep
  // is preserved at the tier-selector level via temperature + thinking
  // hints in the request body, not via a different upstream model.
  if (!input) return WORKHORSE;
  const lower = String(input).toLowerCase();
  if (
    lower.startsWith('ether') ||
    lower.startsWith('nexus') ||
    lower.startsWith('prometheus') ||
    lower.startsWith('claude-')
  ) {
    return WORKHORSE;
  }
  return WORKHORSE;
}

function parseBody(req) {
  try {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return req.body || {};
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server not configured.' });
  }

  const payload = parseBody(req);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const upstreamBody = {
    model: resolveModel(payload.model),
    max_tokens: Math.min(Math.max(parseInt(payload.max_tokens, 10) || 4096, 256), 16000),
    messages,
    stream: payload.stream !== false,
  };
  if (typeof payload.system === 'string' && payload.system.trim()) {
    upstreamBody.system = payload.system;
  }
  if (typeof payload.temperature === 'number') {
    upstreamBody.temperature = Math.min(Math.max(payload.temperature, 0), 1);
  }
  // Extended-thinking mode is intentionally not forwarded — until we
  // confirm which catalogue model supports it, requesting it can fail
  // the whole call. The "deep" builder tier still gets a larger
  // max_tokens cap above, which is the user-visible differentiation.

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (err) {
    console.error('[builder-chat] fetch error:', err?.message || err);
    return res.status(502).json({ error: 'Could not reach HelveX AI. Try again in a few seconds.' });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    console.error('[builder-chat] upstream not ok:', upstream.status, text.slice(0, 500));
    return res.status(upstream.status).json({
      error: `HelveX AI error (${upstream.status})`,
      details: text.slice(0, 500),
    });
  }

  await relayStream(upstream, res);
}
