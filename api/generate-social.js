import { callAnthropicStream, relayStream, parseJsonBody, requirePost } from './_lib/anthropic.js';

const SYSTEM = `You are a senior social-media copywriter for premium brands.

Generate platform-specific posts that respect each platform's voice and limits:
  • Instagram: 1500 chars max, emojis welcome, 3-5 hashtags at end
  • LinkedIn: 1300 chars max, professional, no/few hashtags, hook in first line
  • X (Twitter): 270 chars max (room for retweet), punchy, optional 1 hashtag
  • Facebook: 500 chars max, conversational, 1-2 hashtags

Output ONLY valid JSON (no markdown, no fences):

{
  "posts": [
    { "platform": "instagram", "text": "...", "hashtags": ["..."], "chars": 0 },
    { "platform": "linkedin",  "text": "...", "hashtags": [],     "chars": 0 },
    { "platform": "x",         "text": "...", "hashtags": ["..."], "chars": 0 },
    { "platform": "facebook",  "text": "...", "hashtags": ["..."], "chars": 0 }
  ]
}

Quality bar: zero generic AI filler. Concrete details from the brief.
Each platform's post is rewritten from scratch, not a truncation of the others.`;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const payload = parseJsonBody(req);
  if (!payload) return res.status(400).json({ error: 'Invalid JSON body' });

  const brief = (payload.brief || '').toString().trim();
  if (brief.length < 10) return res.status(400).json({ error: 'Brief too short' });

  const platforms = Array.isArray(payload.platforms) && payload.platforms.length
    ? payload.platforms : ['instagram', 'linkedin', 'x', 'facebook'];
  const tone = payload.tone || 'professional but warm';
  const language = payload.language || 'English';

  const userPrompt = `Generate posts for these platforms only: ${platforms.join(', ')}.
Language: ${language}
Tone: ${tone}

BRIEF:
${brief}

Return only the JSON object per the schema.`;

  try {
    const upstream = await callAnthropicStream({ system: SYSTEM, userPrompt, maxTokens: 2000 });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: `HelveX AI ${upstream.status}`, details: text.slice(0, 500) });
    }
    await relayStream(upstream, res);
  } catch (err) {
    console.error('[generate-social] error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Generation failed' });
  }
}
