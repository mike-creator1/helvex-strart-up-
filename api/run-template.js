// Generic template runner for the Marketplace.
// Each marketplace template is a (system_prompt, user_prompt_template, inputs[])
// stored in the page itself. When the user clicks "Try", the page POSTs here
// with { systemPrompt, userPrompt } and we just relay the streaming response.
//
// This lets the Marketplace ship arbitrarily many templates without needing a
// new endpoint per template.

import { callAnthropicStream, relayStream, parseJsonBody, requirePost } from './_lib/anthropic.js';

const MAX_PROMPT_CHARS = 12000;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const payload = parseJsonBody(req);
  if (!payload) return res.status(400).json({ error: 'Invalid JSON body' });

  const systemPrompt = (payload.systemPrompt || '').toString();
  const userPrompt   = (payload.userPrompt   || '').toString();

  if (!userPrompt.trim()) return res.status(400).json({ error: 'Missing userPrompt' });
  if (systemPrompt.length + userPrompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_CHARS} chars total).` });
  }

  const maxTokens = Math.min(Math.max(parseInt(payload.maxTokens, 10) || 2000, 200), 4096);

  try {
    const upstream = await callAnthropicStream({
      system: systemPrompt || 'You are a helpful, concise assistant.',
      userPrompt,
      maxTokens,
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: `Claude API ${upstream.status}`, details: text.slice(0, 500) });
    }
    await relayStream(upstream, res);
  } catch (err) {
    console.error('[run-template] error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Template run failed' });
  }
}
