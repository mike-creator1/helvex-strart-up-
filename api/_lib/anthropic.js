// Shared Anthropic helper for every HelveX serverless endpoint.
// Files in /api/_lib/* are NOT exposed as routes (underscore prefix
// hides them from Vercel routing) — they're plain JS modules.

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_MODEL = 'claude-sonnet-4-5';

/**
 * Call Claude in streaming mode and return the raw fetch Response so the
 * caller can either parse it or pipe it straight to the browser.
 */
export async function callAnthropicStream({ system, userPrompt, maxTokens = 3000, model = DEFAULT_MODEL, history = [] }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY missing on Vercel.');
    err.code = 'NO_KEY';
    throw err;
  }

  const messages = [...history, { role: 'user', content: userPrompt }];

  return await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      stream: true,
    }),
  });
}

/**
 * Pipe an Anthropic streaming response straight to the Vercel response.
 * The browser receives raw SSE events ("event: content_block_delta" etc.)
 * and parses them in-page.
 */
export async function relayStream(upstream, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder('utf-8');

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    console.error('[anthropic relay] error:', err?.message || err);
  } finally {
    try { res.end(); } catch {}
  }
}

/**
 * Read + parse JSON body from a Vercel Node request defensively.
 */
export function parseJsonBody(req) {
  try {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return req.body || {};
  } catch {
    return null;
  }
}

/**
 * Generic guard: ensure method is POST + API key is configured.
 * Returns true if the request should continue, false if a response was sent.
 */
export function requirePost(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server not configured. ANTHROPIC_API_KEY missing on Vercel.' });
    return false;
  }
  return true;
}
