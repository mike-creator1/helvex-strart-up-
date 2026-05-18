// Catch-all client-side error sink.
//
// Browsers POST window.onerror / unhandledrejection / fetch failures here.
// We forward to public.log_events so every error lands next to product
// telemetry and can be queried alongside activity_events.
//
// Public route (no Bearer required) — error reports should never be
// blocked by auth, especially because auth failure itself is the most
// common kind of report. We still record the owner if a session JWT is
// present so signed-in errors are attributable.

const SUPABASE_URL  = 'https://yjmpallrtpeinpdilptj.supabase.co';
const SUPABASE_ANON = 'sb_publishable_vx5tD4mUizuspej5-g3XlQ_PnbjXSeR';

function safe(value, max = 1000) {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : (() => {
    try { return JSON.stringify(value); } catch { return String(value); }
  })();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

async function resolveOwner(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    return u && u.id ? u.id : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const token = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  const owner = token ? await resolveOwner(token[1].trim()) : null;

  // owner_id is NOT NULL on public.log_events — anonymous errors get
  // dropped silently (still 202 so the browser doesn't retry forever).
  if (!owner) return res.status(202).json({ ok: true, dropped: 'anonymous' });

  const message = safe(body.message, 600) || 'client.error';
  const payload = {
    page: safe(body.page, 240),
    stack: safe(body.stack, 1500),
    type: safe(body.type, 60),
    user_agent: safe(req.headers['user-agent'] || '', 240),
    url: safe(body.url, 240),
    line: typeof body.line === 'number' ? body.line : null,
    column: typeof body.column === 'number' ? body.column : null,
    received_at: new Date().toISOString(),
  };

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/log_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        owner_id: owner,
        level: 'error',
        message,
        payload,
      }),
    });
  } catch {
    // Silent — error monitoring must never crash a page further.
  }

  return res.status(202).json({ ok: true });
}
