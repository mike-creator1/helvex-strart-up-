// HelveX live system status.
//
// Public — no auth required. Pings every critical dependency and
// returns structured JSON the status.html page consumes. Designed to
// be cheap enough to call every 30s without burning anything.
//
//   GET  /api/health
//   200  { ok: true,  services: { api, supabase, anthropic }, ms }
//   503  { ok: false, services: { ... }, ms }  on any failure

const SUPABASE_URL = 'https://yjmpallrtpeinpdilptj.supabase.co';
const SUPABASE_ANON = 'sb_publishable_vx5tD4mUizuspej5-g3XlQ_PnbjXSeR';

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { name: label, ok: !!result, ms: Date.now() - t0 };
  } catch (err) {
    return { name: label, ok: false, ms: Date.now() - t0, error: String(err?.message || err).slice(0, 120) };
  }
}

async function checkSupabase() {
  // PostgREST returns 401/4xx for unauthenticated paths but anything
  // under 500 means the database/PostgREST process is up and serving.
  // Only a network failure or 5xx counts as "down".
  const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: SUPABASE_ANON },
    signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
  });
  return r.status < 500;
}

async function checkAnthropic() {
  // HEAD on the messages endpoint with no body is rejected as 4xx but
  // proves the upstream is reachable. We treat 4xx/5xx differently from
  // a network failure: only a network failure should flip ok=false.
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'OPTIONS',
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
    });
    return r.status < 500;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  const started = Date.now();
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const [supa, ant] = await Promise.all([
    timed('supabase', checkSupabase),
    timed('anthropic', checkAnthropic),
  ]);
  const api = { name: 'api', ok: true, ms: Date.now() - started };
  const services = [api, supa, ant];
  const ok = services.every((s) => s.ok);

  res.status(ok ? 200 : 503).json({
    ok,
    ms: Date.now() - started,
    region: process.env.VERCEL_REGION || null,
    deployed: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
    timestamp: new Date().toISOString(),
    services,
  });
}
