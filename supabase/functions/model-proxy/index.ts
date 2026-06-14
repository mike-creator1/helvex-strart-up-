// HelveX model-proxy — proxies Ether/Nexus/Prometheus to upstream providers.
// The response NEVER exposes the upstream model name or provider — only
// HelveX brand IDs. ALL THREE route to OpenAI. Ether = smart everyday
// assistant (gpt-4o). Nexus = strong agent (gpt-4o + web). Prometheus =
// flagship agent (gpt-4o, higher credit multiplier).
//
// WEB SEARCH: when the request asks for web (tools.web === true — the
// frontend sets this for the agentic models Nexus/Prometheus, and for any
// model when the user toggles web on), the call is routed to OpenAI's
// *-search-preview models, which search the live web and return URL
// citations. Those citations are appended to the answer as a Sources list,
// so Nexus/Prometheus genuinely "search and cite" as the site promises —
// using only the existing OPENAI_API_KEY (no second provider key).
// OpenAI's stream is translated into the SAME Anthropic-style SSE the
// frontend already understands.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Provider = "anthropic" | "openai";
const MODEL_MAP: Record<string, { provider: Provider; upstream: string; search: string; mult: number; max: number; ctx: number; }> = {
  ether:      { provider: "openai", upstream: "gpt-4o",      search: "gpt-4o-search-preview",      mult: 1,  max: 8192,  ctx: 128_000 },
  nexus:      { provider: "openai", upstream: "gpt-4o",      search: "gpt-4o-search-preview",      mult: 5,  max: 16384, ctx: 128_000 },
  prometheus: { provider: "openai", upstream: "gpt-4o",      search: "gpt-4o-search-preview",      mult: 12, max: 16384, ctx: 128_000 },
};

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-helvex-trace, accept",
};

function json(status: number, body: unknown, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

function newTraceId(): string {
  const t = Date.now().toString(36);
  const r = crypto.getRandomValues(new Uint8Array(12));
  let s = ""; for (const b of r) s += b.toString(36).padStart(2, "0");
  return `hxr_${t}${s.slice(0, 18)}`;
}

async function pg(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string,string> ?? {}),
    },
  });
}

async function rpc<T = unknown>(name: string, args: Record<string,unknown>): Promise<T> {
  const r = await pg(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`rpc ${name} ${r.status}: ${t}`);
  }
  return r.json();
}

async function resolveOwner(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const tok = m[1].trim();

  if (tok.startsWith("hxk_")) {
    const owner = await rpc<string | null>("auth_by_api_key", { p_plaintext: tok });
    return owner ?? null;
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${tok}` },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null) as { id?: string } | null;
  return u?.id ?? null;
}

async function balanceOf(owner: string): Promise<number> {
  const r = await pg(`credits_balance?user_id=eq.${encodeURIComponent(owner)}&select=credits_total,credits_used`);
  if (!r.ok) return 0;
  const rows = await r.json().catch(() => []) as Array<{credits_total:number;credits_used:number}>;
  const row = rows[0]; if (!row) return 0;
  return Math.max(0, (row.credits_total ?? 0) - (row.credits_used ?? 0));
}

function estimateCredits(messages: unknown, mult: number, max_tokens: number): number {
  let chars = 0;
  let imageCount = 0;
  if (Array.isArray(messages)) {
    for (const m of messages) {
      const c = (m as { content?: unknown }).content;
      if (typeof c === "string") chars += c.length;
      else if (Array.isArray(c)) for (const blk of c) {
        if (typeof blk !== "object" || !blk) continue;
        const t = (blk as { type?: string }).type;
        if (t === "text" && "text" in blk) chars += String((blk as {text?:unknown}).text ?? "").length;
        if (t === "image")    imageCount += 1;
        if (t === "document") chars += 4000;
      }
    }
  }
  const promptTokens = Math.ceil(chars / 4) + imageCount * 1600;
  return Math.max(1, Math.ceil((promptTokens + max_tokens) / 1000) * mult);
}

function lastUserText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown };
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      let s = "";
      for (const b of m.content) if (typeof b === "object" && b && (b as {type?:string}).type === "text" && "text" in b) s += String((b as {text?:unknown}).text ?? "");
      return s;
    }
    return "";
  }
  return "";
}

function sanitizeAttachments(input: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const a of input) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const kind = typeof o.kind === "string" ? o.kind : (typeof o.type === "string" ? o.type : "");
    if (kind !== "image" && kind !== "document" && kind !== "file") continue;
    out.push({
      kind,
      name:        typeof o.name === "string" ? o.name : null,
      media_type:  typeof o.media_type === "string" ? o.media_type : null,
      size:        typeof o.size === "number" ? o.size : null,
      storage_path: typeof o.storage_path === "string" ? o.storage_path : null,
    });
    if (out.length >= 10) break;
  }
  return out;
}

// Convert Anthropic-style messages (+ separate system) into OpenAI chat format.
function toOpenAIMessages(system: unknown, messages: unknown[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (typeof system === "string" && system.length) out.push({ role: "system", content: system });
  for (const m of messages) {
    const mm = m as { role?: string; content?: unknown };
    const role = mm.role === "assistant" ? "assistant" : "user";
    const c = mm.content;
    if (typeof c === "string") { out.push({ role, content: c }); continue; }
    if (Array.isArray(c)) {
      const parts: Array<Record<string, unknown>> = [];
      for (const blk of c) {
        if (!blk || typeof blk !== "object") continue;
        const b = blk as Record<string, unknown>;
        if (b.type === "text") parts.push({ type: "text", text: String(b.text ?? "") });
        else if (b.type === "image" && b.source && typeof b.source === "object") {
          const src = b.source as Record<string, unknown>;
          if (src.type === "base64" && typeof src.data === "string") {
            parts.push({ type: "image_url", image_url: { url: `data:${src.media_type};base64,${src.data}` } });
          }
        }
      }
      if (parts.length && parts.every((p) => p.type === "text")) {
        out.push({ role, content: parts.map((p) => String(p.text ?? "")).join("\n") });
      } else if (parts.length) {
        out.push({ role, content: parts });
      } else {
        out.push({ role, content: "" });
      }
      continue;
    }
    out.push({ role, content: "" });
  }
  return out;
}

// Collect url_citation annotations (streaming delta or final message) into a
// de-duplicated url→title map.
function collectAnnotations(into: Map<string,string>, annotations: unknown) {
  if (!Array.isArray(annotations)) return;
  for (const an of annotations) {
    if (!an || typeof an !== "object") continue;
    const a = an as { type?: string; url_citation?: { url?: string; title?: string } };
    if (a.type === "url_citation" && a.url_citation && typeof a.url_citation.url === "string") {
      const url = a.url_citation.url;
      if (!into.has(url)) into.set(url, String(a.url_citation.title ?? url));
    }
  }
}

function sourcesBlock(sources: Map<string,string>): string {
  if (sources.size === 0) return "";
  let i = 1, s = "\n\n---\nSources:\n";
  for (const [url, title] of sources) { s += `${i}. ${title} — ${url}\n`; i++; }
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json(405, { error: "method_not_allowed" });

  const traceId = req.headers.get("x-helvex-trace") ?? newTraceId();
  const startMs = Date.now();

  let body: {
    model?: string; messages?: unknown; system?: unknown; max_tokens?: number;
    temperature?: number; conversation_id?: string; stream?: boolean;
    user_attachments?: unknown; tools?: { web?: boolean; code?: boolean };
  };
  try { body = await req.json(); } catch {
    return json(400, { error: "invalid_json", trace_id: traceId });
  }

  const owner = await resolveOwner(req);
  if (!owner) return json(401, { error: "unauthorized", trace_id: traceId });

  const model = (body.model ?? "ether").toLowerCase();
  const map = MODEL_MAP[model];
  if (!map) return json(400, { error: "unknown_model", trace_id: traceId, hint: "Use ether|nexus|prometheus." });

  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length === 0) return json(400, { error: "messages_required", trace_id: traceId });

  const max_tokens = Math.min(map.max, Math.max(64, body.max_tokens ?? 1024));
  const estimate = estimateCredits(messages, map.mult, max_tokens);
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : null;
  const userText = lastUserText(messages);
  const userAttachments = sanitizeAttachments(body.user_attachments);
  const wantStream = body.stream === true;
  const useWeb = !!(body.tools && body.tools.web === true);

  if (conversationId) {
    const r = await pg(`conversations?id=eq.${encodeURIComponent(conversationId)}&owner_id=eq.${encodeURIComponent(owner)}&select=id`);
    const arr = (await r.json().catch(() => [])) as unknown[];
    if (!Array.isArray(arr) || arr.length === 0) {
      return json(404, { error: "conversation_not_found", trace_id: traceId });
    }
  }

  async function recordUserOnly() {
    if (!conversationId) return;
    await rpc("chat_record_user_only", {
      p_conversation_id: conversationId, p_owner: owner,
      p_user_content: userText, p_trace_id: traceId, p_user_attachments: userAttachments,
    }).catch(() => {});
  }
  async function recordError(message: string, payload: Record<string, unknown>) {
    await recordUserOnly();
    await rpc("record_model_call", {
      p_owner: owner, p_model: model, p_prompt_t: 0, p_completion_t: 0,
      p_latency_ms: Date.now() - startMs, p_status: "error", p_trace_id: traceId,
      p_message: message, p_payload: payload,
    }).catch(() => {});
  }
  async function finishOk(assistantText: string, inT: number, outT: number, stopReason: string | null, latency: number, extraPayload: Record<string, unknown>) {
    const actualCredits = Math.max(1, Math.ceil((inT + outT) / 1000) * map.mult);
    await rpc("debit_credits", {
      p_owner: owner, p_amount: actualCredits, p_model: model,
      p_reason: "model_call", p_trace_id: traceId,
    }).catch(() => {});
    await rpc("record_model_call", {
      p_owner: owner, p_model: model, p_prompt_t: inT, p_completion_t: outT,
      p_latency_ms: latency, p_status: "ok", p_trace_id: traceId,
      p_message: `${model} ${inT}+${outT}t in ${latency}ms`,
      p_payload: { stop_reason: stopReason, credits: actualCredits, ...extraPayload },
    }).catch(() => {});
    if (conversationId) {
      await rpc("chat_record_pair", {
        p_conversation_id: conversationId, p_owner: owner,
        p_user_content: userText, p_assistant_content: assistantText,
        p_model: model, p_prompt_t: inT, p_completion_t: outT,
        p_latency_ms: latency, p_trace_id: traceId, p_user_attachments: userAttachments,
      }).catch(() => {});
    }
    return actualCredits;
  }

  const avail = await balanceOf(owner);
  if (avail < estimate) {
    await recordUserOnly();
    await rpc("record_model_call", {
      p_owner: owner, p_model: model, p_prompt_t: 0, p_completion_t: 0,
      p_latency_ms: 0, p_status: "error", p_trace_id: traceId,
      p_message: "insufficient_credits", p_payload: { estimate, available: avail },
    }).catch(() => {});
    return json(402, { error: "insufficient_credits", trace_id: traceId, estimate, available: avail });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // ─────────────── OPENAI (all models, +web search) ──────────────
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    await recordError("upstream_unconfigured", { hint: "OPENAI_API_KEY not set" });
    return json(503, { error: "upstream_unconfigured", trace_id: traceId,
      hint: "Upstream inference is not connected. Workspace admin needs to set the OpenAI API key." });
  }

  const oaMessages = toOpenAIMessages(body.system, messages);
  // When web search is requested, route to OpenAI's search-preview model.
  // Those models run a live web search and return url_citation annotations,
  // but they do NOT accept temperature/top_p — so we omit temperature and
  // pass web_search_options instead.
  const upstreamModel = useWeb ? map.search : map.upstream;
  const payload: Record<string, unknown> = {
    model: upstreamModel,
    max_tokens,
    messages: oaMessages,
  };
  if (useWeb) {
    payload.web_search_options = {};
  } else if (typeof body.temperature === "number") {
    payload.temperature = body.temperature;
  }
  if (wantStream) { payload.stream = true; payload.stream_options = { include_usage: true }; }

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    await recordError("upstream_unreachable", { error: String(err) });
    return json(502, { error: "upstream_unreachable", trace_id: traceId, message: "Upstream inference is unreachable." });
  }

  if (!upstream.ok || !upstream.body) {
    const errBody = await upstream.json().catch(() => null) as { error?: { message?: string } } | null;
    await recordError(errBody?.error?.message ?? `upstream_${upstream.status}`, { upstream_status: upstream.status, web: useWeb });
    return json(upstream.status, { error: "upstream_error", trace_id: traceId, upstream_status: upstream.status, message: errBody?.error?.message ?? null });
  }

  if (wantStream) {
    let assistantText = "";
    let inT = 0, outT = 0;
    let stopReason: string | null = null;
    let upstreamErr: string | null = null;
    let buf = "";
    const sources = new Map<string,string>();
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buf += decoder.decode(chunk, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data);
            const choice = obj.choices && obj.choices[0];
            if (choice && choice.delta && typeof choice.delta.content === "string" && choice.delta.content.length) {
              assistantText += choice.delta.content;
              const out = `event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: "text_delta", text: choice.delta.content } })}\n\n`;
              controller.enqueue(encoder.encode(out));
            }
            if (choice && choice.delta) collectAnnotations(sources, choice.delta.annotations);
            if (choice && choice.message) collectAnnotations(sources, choice.message.annotations);
            if (choice && choice.finish_reason) stopReason = String(choice.finish_reason);
            if (obj.usage) {
              if (typeof obj.usage.prompt_tokens === "number") inT = obj.usage.prompt_tokens;
              if (typeof obj.usage.completion_tokens === "number") outT = obj.usage.completion_tokens;
            }
            if (obj.error?.message) upstreamErr = String(obj.error.message);
          } catch { /* incomplete */ }
        }
      },
      async flush(controller) {
        const latency = Date.now() - startMs;
        const ok = !upstreamErr && assistantText.length > 0;
        let credits = 0;
        if (ok) {
          const src = sourcesBlock(sources);
          if (src) {
            controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: "text_delta", text: src } })}\n\n`));
            assistantText += src;
          }
          if (outT === 0) outT = Math.ceil(assistantText.length / 4);
          credits = await finishOk(assistantText, inT, outT, stopReason, latency, { stream: true, provider: "openai", web: useWeb, sources: sources.size });
        } else {
          await recordError(upstreamErr ?? "empty_stream", { stream: true, provider: "openai", web: useWeb });
        }
        const tail = ok
          ? { trace_id: traceId, latency_ms: latency, stop_reason: stopReason, usage: { prompt_tokens: inT, completion_tokens: outT, credits } }
          : { trace_id: traceId, latency_ms: latency, error: upstreamErr ?? "empty_stream" };
        controller.enqueue(encoder.encode(`event: helvex_done\ndata: ${JSON.stringify(tail)}\n\n`));
      },
    });
    return new Response(upstream.body.pipeThrough(transform), {
      status: 200,
      headers: {
        "Content-Type":  "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection":    "keep-alive",
        "X-HelveX-Trace": traceId,
        ...CORS,
      },
    });
  }

  // non-stream
  const result = await upstream.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string; annotations?: unknown }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  const latency = Date.now() - startMs;
  const msg = result?.choices?.[0]?.message;
  let assistantText = msg?.content ?? "";
  const sources = new Map<string,string>();
  collectAnnotations(sources, msg?.annotations);
  assistantText += sourcesBlock(sources);
  const inT = result?.usage?.prompt_tokens ?? 0;
  let outT = result?.usage?.completion_tokens ?? 0;
  if (outT === 0) outT = Math.ceil(assistantText.length / 4);
  const stopReason = result?.choices?.[0]?.finish_reason ?? null;
  const credits = await finishOk(assistantText, inT, outT, stopReason, latency, { provider: "openai", web: useWeb, sources: sources.size });
  return json(200, {
    trace_id: traceId, model, latency_ms: latency,
    usage: { prompt_tokens: inT, completion_tokens: outT, credits },
    content: [{ type: "text", text: assistantText }],
    stop_reason: stopReason,
  });
});
