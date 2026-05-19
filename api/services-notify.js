// POST /api/services-notify
//
// Called by the browser immediately after a service_requests row is
// inserted. Sends two emails:
//   1. To the HelveX team (HELVEX_TEAM_EMAIL): "new request, scope below"
//   2. To the customer: "we got it, expect a quote within 48 hours"
//
// Reads the row server-side using the caller's Supabase JWT so RLS
// confirms they're the owner — the request_id cannot be spoofed to
// notify on someone else's row.

import { requireUser, SUPABASE_URL, SUPABASE_ANON } from './_lib/auth.js';
import { sendEmail, emailShell, TEAM_EMAIL, escapeHtml } from './_lib/email.js';

const SERVICE_LABEL = {
  agents:     'Custom AI agents',
  automation: 'Workflow automation',
  data:       'Data tooling / pipelines',
  copilot:    'Internal copilot',
  triage:     'Document / inbox triage',
  other:      'Custom request',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = (typeof req.body === 'string') ? safeJson(req.body) : (req.body || {});
  const requestId = (body && body.request_id) ? String(body.request_id) : '';
  if (!requestId) return res.status(400).json({ error: 'request_id required' });

  // Read the row through Supabase REST with the caller's JWT — RLS
  // makes this fail unless they're the owner.
  let row;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/service_requests?id=eq.${encodeURIComponent(requestId)}&select=*`, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${auth.token}`,
      },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return res.status(502).json({ error: `Lookup failed: ${t.slice(0, 200)}` });
    }
    const data = await r.json();
    row = Array.isArray(data) ? data[0] : null;
  } catch (err) {
    return res.status(500).json({ error: 'Could not read request.' });
  }

  if (!row) return res.status(404).json({ error: 'Request not found or not yours.' });

  const customerEmail = auth.user.email;
  const serviceLabel  = SERVICE_LABEL[row.service_type] || row.service_type;
  const submittedAt   = new Date(row.created_at).toLocaleString();

  // ── Team notification ───────────────────────────────────────────
  const teamHtml = emailShell({
    title: `New service request — ${serviceLabel}`,
    intro: `${customerEmail || 'A customer'} just submitted a service request. Reply within 48 hours.`,
    rows: [
      { label: 'Customer',       value: customerEmail || 'unknown' },
      { label: 'Service',        value: serviceLabel },
      { label: 'Budget band',    value: row.budget_band || 'open' },
      { label: 'Preferred start', value: row.preferred_start || 'not set' },
      { label: 'Submitted',      value: submittedAt },
      { label: 'Brief',          html: `<div style="white-space:pre-wrap;">${escapeHtml(row.scope_brief || '')}</div>` },
      { label: 'Request ID',     value: row.id },
    ],
    footnote: 'Reply directly to this email to reach the customer. Manage the request inside the HelveX admin.',
  });
  const teamRes = await sendEmail({
    to: TEAM_EMAIL,
    subject: `[Services] ${serviceLabel} — ${customerEmail || 'new request'}`,
    html: teamHtml,
    text: `New service request from ${customerEmail}. Service: ${serviceLabel}. Budget: ${row.budget_band}. Brief:\n\n${row.scope_brief}\n\nRequest ID: ${row.id}`,
    replyTo: customerEmail || undefined,
  });

  // ── Customer confirmation ───────────────────────────────────────
  let custRes = { ok: true, skipped: true };
  if (customerEmail) {
    const custHtml = emailShell({
      title: 'We received your request.',
      intro: 'Thanks for reaching out. A senior engineer will review your brief and reply with a fixed scope + quote within 48 hours on business days.',
      rows: [
        { label: 'Service',  value: serviceLabel },
        { label: 'Submitted', value: submittedAt },
        { label: 'Track at', html: '<a href="https://www.helvex.com/services" style="color:#0f0f10;">helvex.com/services</a>' },
      ],
      footnote: 'You can cancel the request any time from your Services page in the workspace. Reply to this email if you want to add details before we get back to you.',
    });
    custRes = await sendEmail({
      to: customerEmail,
      subject: `We received your request — ${serviceLabel}`,
      html: custHtml,
      text: `Thanks — we received your request for ${serviceLabel}. We'll reply with a quote within 48 hours. Track at helvex.com/services.`,
      replyTo: TEAM_EMAIL,
    });
  }

  return res.status(200).json({
    ok: true,
    team:     { ok: teamRes.ok, error: teamRes.error || null },
    customer: { ok: custRes.ok, skipped: !!custRes.skipped, error: custRes.error || null },
  });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
