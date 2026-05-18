import { callAnthropicStream, relayStream, parseJsonBody, requirePost } from './_lib/anthropic.js';
import { gateAndCharge } from './_lib/auth.js';

const SYSTEM = `You are a performance-marketing copywriter who writes ad copy that converts.

For each platform requested, produce 3 distinct variants (different hook angles) per
ad slot. Stay strictly within character limits — Meta/Google enforce truncation that
breaks the meaning if you go over.

Limits per platform:
  • Meta (Facebook/Instagram Ads):
      primary_text: 125 chars (will be truncated past this in feed)
      headline:     27 chars
      description:  27 chars
  • Google Search Ads:
      headline:     30 chars (need exactly 3 distinct headlines per variant)
      description:  90 chars (need exactly 2 distinct descriptions per variant)
  • TikTok:
      caption:      80 chars
      hook (text-on-screen for first 1s): 30 chars

Output ONLY valid JSON, no markdown:

{
  "ads": [
    {
      "platform": "meta",
      "variants": [
        { "angle": "...", "primary_text": "...", "headline": "...", "description": "...", "cta": "Learn More" }
      ]
    },
    {
      "platform": "google",
      "variants": [
        { "angle": "...", "headlines": ["", "", ""], "descriptions": ["", ""] }
      ]
    },
    {
      "platform": "tiktok",
      "variants": [ { "angle": "...", "hook": "...", "caption": "..." } ]
    }
  ]
}

Hook each variant with a different angle (pain, dream-state, proof, urgency, etc.).
Concrete benefits. No vague "Discover the power of..." cliches.`;

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const payload = parseJsonBody(req);
  if (!payload) return res.status(400).json({ error: 'Invalid JSON body' });

  const brief = (payload.brief || '').toString().trim();
  if (brief.length < 10) return res.status(400).json({ error: 'Brief too short' });

  const platforms = Array.isArray(payload.platforms) && payload.platforms.length
    ? payload.platforms : ['meta', 'google', 'tiktok'];
  const variantsPer = Math.min(Math.max(parseInt(payload.variantsPerPlatform, 10) || 3, 1), 5);
  const language = payload.language || 'English';

  const userPrompt = `Platforms: ${platforms.join(', ')}.
Variants per platform: ${variantsPer}
Language: ${language}

BRIEF:
${brief}

Return only the JSON object per the schema. Stay strictly within character limits.`;

  const gate = await gateAndCharge(req, 'nexus-4-5', 1);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, trace_id: gate.traceId });

  try {
    const upstream = await callAnthropicStream({ system: SYSTEM, userPrompt, maxTokens: 2500 });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: `HelveX AI ${upstream.status}`, details: text.slice(0, 500) });
    }
    await relayStream(upstream, res);
  } catch (err) {
    console.error('[generate-ads] error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Generation failed' });
  }
}
