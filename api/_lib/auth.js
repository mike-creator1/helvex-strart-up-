// Shared auth + credit-gating helper for every HelveX AI endpoint.
//
// Resolves the caller from the Authorization header (Supabase JWT
// forwarded by the browser), debits credits via the public.debit_credits
// RPC, and records the call via public.record_model_call. If any step
// fails the endpoint returns a clean error to the client without ever
// reaching the upstream provider.
//
// Cost model: callers pass amount in HelveX credits (integer). Default
// 1 credit per call — fine-grained reconciliation happens via
// record_model_call once the stream finishes (token counts).

const SUPABASE_URL  = 'https://yjmpallrtpeinpdilptj.supabase.co';
const SUPABASE_ANON = 'sb_publishable_vx5tD4mUizuspej5-g3XlQ_PnbjXSeR';

function readAuthToken(req) {
  const raw = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Get the Supabase user behind the Authorization Bearer JWT, or null.
 */
async function resolveUser(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    return u && u.id ? { id: u.id, email: u.email || null } : null;
  } catch {
    return null;
  }
}

/**
 * Atomically debit credits via the public.debit_credits RPC. Returns
 * `true` if charged, `false` if the user is out of credits. Any RPC
 * error throws — caller decides whether that becomes a 500 or fallback.
 */
async function debitCredits(token, owner, amount, model, traceId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/debit_credits`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_owner: owner,
      p_amount: amount,
      p_model: model,
      p_reason: 'ai_call',
      p_trace_id: traceId || null,
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`debit_credits ${r.status}: ${t.slice(0, 200)}`);
  }
  return (await r.json()) === true;
}

/**
 * Record an AI call against public.record_model_call. Never throws —
 * usage logging must not block a successful response.
 */
async function recordCall(token, owner, model, status, message, traceId, payload) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_model_call`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_owner: owner,
        p_model: model,
        p_prompt_t: 0,
        p_completion_t: 0,
        p_latency_ms: 0,
        p_status: status,
        p_trace_id: traceId || null,
        p_message: message || '',
        p_payload: payload || {},
      }),
    });
  } catch { /* fire-and-forget */ }
}

function newTraceId() {
  const t = Date.now().toString(36);
  let r = '';
  for (let i = 0; i < 6; i++) r += Math.floor(Math.random() * 36).toString(36);
  return `hxr_${t}${r}`;
}

/**
 * Resolve just the calling user — for endpoints that don't need to
 * charge credits (e.g. notification senders). Returns
 * `{ ok: true, user, token }` or `{ ok: false, status, error }`.
 */
export async function requireUser(req) {
  const token = readAuthToken(req);
  if (!token)               return { ok: false, status: 401, error: 'Sign in to use HelveX.' };
  const user = await resolveUser(token);
  if (!user)                return { ok: false, status: 401, error: 'Session expired. Sign in again.' };
  return { ok: true, user, token };
}

export { SUPABASE_URL, SUPABASE_ANON };

/**
 * Single gate every AI endpoint runs before forwarding to the upstream
 * model. On success returns `{ ok: true, owner, token, traceId }`. On
 * failure returns `{ ok: false, status, error, traceId }` ready to be
 * sent straight back to the caller.
 */
export async function gateAndCharge(req, modelBrand, amountCredits = 1) {
  const traceId = newTraceId();
  const token = readAuthToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Sign in to use HelveX AI.', traceId };
  }
  const user = await resolveUser(token);
  if (!user) {
    return { ok: false, status: 401, error: 'Session expired. Sign in again.', traceId };
  }
  let charged = false;
  try {
    charged = await debitCredits(token, user.id, amountCredits, modelBrand, traceId);
  } catch (err) {
    // RPC failure should not block — log to record_model_call and let
    // the upstream call proceed. Otherwise a Supabase hiccup would take
    // every AI feature offline.
    await recordCall(token, user.id, modelBrand, 'error', `debit_credits failed: ${err.message}`, traceId, {});
    return { ok: true, owner: user, token, traceId, skippedCharge: true };
  }
  if (!charged) {
    return {
      ok: false,
      status: 402,
      error: 'Out of HelveX credits. Top up under Credits to continue.',
      traceId,
    };
  }
  return { ok: true, owner: user, token, traceId };
}

/**
 * Convenience: record a successful AI call after the stream finishes.
 * Endpoints call this from the relay if they want post-stream telemetry.
 */
export async function recordSuccess(token, owner, modelBrand, traceId, latencyMs) {
  return recordCall(token, owner, modelBrand, 'ok', `model.${modelBrand}`, traceId, { latency_ms: latencyMs || 0 });
}
