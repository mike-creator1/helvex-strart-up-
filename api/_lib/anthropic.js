// Shared upstream-AI helper for every HelveX serverless endpoint.
// Files in /api/_lib/* are NOT exposed as routes (underscore prefix
// hides them from Vercel routing) — they're plain JS modules.

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_MODEL = 'claude-sonnet-4-5';

/**
 * Call the upstream model in streaming mode and return the raw fetch Response
 * so the caller can either parse it or pipe it straight to the browser.
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
 * Pipe an upstream streaming response straight to the Vercel response.
 * The browser receives raw SSE events ("event: content_block_delta" etc.)
 * and parses them in-page.
 *
 * Sanitises every "data:" line so the upstream model id ("claude-…") is
 * never echoed to the client. We rewrite the `model` field inside any
 * JSON payload (message_start, message_delta, etc.) to the HelveX brand
 * model name before forwarding.
 */
const HELVEX_MODEL_LABEL = 'nexus-4-5';

function sanitiseSsePayload(raw) {
  // Process line-by-line so we can rewrite only "data:" JSON lines and
  // pass everything else through unchanged. A buffer is kept across
  // chunks via the caller.
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('data: ')) {
      const body = line.slice(6);
      if (body && body !== '[DONE]' && body.includes('"model"')) {
        try {
          const obj = JSON.parse(body);
          if (obj && typeof obj === 'object') {
            if (typeof obj.model === 'string') obj.model = HELVEX_MODEL_LABEL;
            if (obj.message && typeof obj.message === 'object' && typeof obj.message.model === 'string') {
              obj.message.model = HELVEX_MODEL_LABEL;
            }
            lines[i] = 'data: ' + JSON.stringify(obj);
          }
        } catch { /* not JSON we can rewrite — leave as-is */ }
      }
    }
  }
  return lines.join('\n');
}

export async function relayStream(upstream, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Flush every complete SSE event (terminated by a blank line) and
      // keep the trailing partial in the buffer for the next chunk.
      const lastBoundary = buffer.lastIndexOf('\n\n');
      if (lastBoundary !== -1) {
        const ready = buffer.slice(0, lastBoundary + 2);
        buffer = buffer.slice(lastBoundary + 2);
        res.write(sanitiseSsePayload(ready));
      }
    }
    if (buffer) res.write(sanitiseSsePayload(buffer));
  } catch (err) {
    console.error('[upstream relay] error:', err?.message || err);
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
    res.status(500).json({ error: 'Server not configured.' });
    return false;
  }
  return true;
}
