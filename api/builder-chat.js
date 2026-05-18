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
const MODEL_MAP = {
  'ether-20240307':     'claude-3-haiku-20240307',
  'nexus-3-7-20250219': 'claude-3-7-sonnet-20250219',
  'prometheus-20240229':'claude-3-opus-20240229',
};

// Aliases for convenience — anything that starts with one of these prefixes
// resolves to the matching workhorse model. Keeps the browser code from
// having to know about specific date stamps.
function resolveModel(input) {
  if (!input) return 'claude-sonnet-4-5';
  if (MODEL_MAP[input]) return MODEL_MAP[input];
  const lower = String(input).toLowerCase();
  if (lower.startsWith('ether'))      return 'claude-3-haiku-20240307';
  if (lower.startsWith('nexus'))      return 'claude-3-7-sonnet-20250219';
  if (lower.startsWith('prometheus')) return 'claude-3-opus-20240229';
  // Anything still containing a brand prefix is treated as untrusted — fall
  // back to the production workhorse rather than echoing arbitrary text into
  // the upstream model field.
  return 'claude-sonnet-4-5';
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
  if (payload.thinking && typeof payload.thinking === 'object') {
    // Extended-thinking mode — only valid on certain models; if the
    // resolved model doesn't support it the upstream will surface that
    // error and the relay forwards it untouched.
    upstreamBody.thinking = payload.thinking;
  }

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
