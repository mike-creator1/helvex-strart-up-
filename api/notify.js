// /api/notify — single Hobby-friendly entry point for outbound
// transactional notifications. Routes by `kind`:
//   kind: 'service_request'    body: { request_id }
//   kind: 'consulting_booking' body: { booking_id }
//
// Looks up the row server-side using the caller's Supabase JWT (RLS
// confirms ownership), then fans two emails: one to the HelveX team
// and one back to the customer. Resend-backed.

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
const TIER_LABEL = {
  strategic: 'Strategic — direction & positioning',
  growth:    'Growth — distribution & monetisation',
  ops:       'Ops — execution & systems',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = await requireUser(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = (typeof req.body === 'string') ? safeJson(req.body) : (req.body || {});
  const kind = (body && body.kind) ? String(body.kind) : '';

  if (kind === 'service_request')    return notifyServiceRequest(auth, body, res);
  if (kind === 'consulting_booking') return notifyConsultingBooking(auth, body, res);
  return res.status(400).json({ error: `Unknown kind "${kind}". Use service_request or consulting_booking.` });
}

async function notifyServiceRequest(auth, body, res) {
  const requestId = body.request_id ? String(body.request_id) : '';
  if (!requestId) return res.status(400).json({ error: 'request_id required' });

  const row = await readRow(auth.token, 'service_requests', requestId);
  if (row.error) return res.status(row.status).json({ error: row.error });
  if (!row.data) return res.status(404).json({ error: 'Request not found or not yours.' });

  const r = row.data;
  const customerEmail = auth.user.email;
  const serviceLabel  = SERVICE_LABEL[r.service_type] || r.service_type;
  const submittedAt   = new Date(r.created_at).toLocaleString();

  const teamHtml = emailShell({
    title: `New service request — ${serviceLabel}`,
    intro: `${customerEmail || 'A customer'} just submitted a service request. Reply within 48 hours.`,
    rows: [
      { label: 'Customer',        value: customerEmail || 'unknown' },
      { label: 'Service',         value: serviceLabel },
      { label: 'Budget band',     value: r.budget_band || 'open' },
      { label: 'Preferred start', value: r.preferred_start || 'not set' },
      { label: 'Submitted',       value: submittedAt },
      { label: 'Brief',           html: `<div style="white-space:pre-wrap;">${escapeHtml(r.scope_brief || '')}</div>` },
      { label: 'Request ID',      value: r.id },
    ],
    footnote: 'Reply directly to this email to reach the customer. Manage the request inside the HelveX admin.',
  });
  const teamRes = await sendEmail({
    to: TEAM_EMAIL,
    subject: `[Services] ${serviceLabel} — ${customerEmail || 'new request'}`,
    html: teamHtml,
    text: `New service request from ${customerEmail}. Service: ${serviceLabel}. Budget: ${r.budget_band}. Brief:\n\n${r.scope_brief}\n\nRequest ID: ${r.id}`,
    replyTo: customerEmail || undefined,
  });

  let custRes = { ok: true, skipped: true };
  if (customerEmail) {
    const custHtml = emailShell({
      title: 'We received your request.',
      intro: 'Thanks for reaching out. A senior engineer will review your brief and reply with a fixed scope + quote within 48 hours on business days.',
      rows: [
        { label: 'Service',   value: serviceLabel },
        { label: 'Submitted', value: submittedAt },
      ],
      footnote: 'You can cancel the request any time from your Services page in the workspace. Reply to this email if you want to add details before we get back to you.',
    });
    custRes = await sendEmail({
      to: customerEmail,
      subject: `We received your request — ${serviceLabel}`,
      html: custHtml,
      text: `Thanks — we received your request for ${serviceLabel}. We'll reply with a quote within 48 hours.`,
      replyTo: TEAM_EMAIL,
    });
  }

  return res.status(200).json({
    ok: true,
    team:     { ok: teamRes.ok, error: teamRes.error || null },
    customer: { ok: custRes.ok, skipped: !!custRes.skipped, error: custRes.error || null },
  });
}

async function notifyConsultingBooking(auth, body, res) {
  const bookingId = body.booking_id ? String(body.booking_id) : '';
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

  const row = await readRow(auth.token, 'consulting_bookings', bookingId);
  if (row.error) return res.status(row.status).json({ error: row.error });
  if (!row.data) return res.status(404).json({ error: 'Booking not found or not yours.' });

  const r = row.data;
  const customerEmail = auth.user.email;
  const tierLabel     = TIER_LABEL[r.plan_tier] || r.plan_tier;
  const submittedAt   = new Date(r.created_at).toLocaleString();
  const slots         = Array.isArray(r.preferred_slots) ? r.preferred_slots : [];
  const slotsList     = slots.map((s) => {
    try { return new Date(s).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return s; }
  });
  const slotsHtml = slotsList.length
    ? slotsList.map((s) => `<div style="display:inline-block;margin:2px 4px 2px 0;padding:4px 9px;background:#f5f5f5;border-radius:6px;font-family:monospace;font-size:12px;">${escapeHtml(s)}</div>`).join('')
    : '<em>none — customer left this blank</em>';

  const teamHtml = emailShell({
    title: `New consulting booking — ${tierLabel}`,
    intro: `${customerEmail || 'A customer'} requested a ${r.duration_minutes}-minute session. Pick one of their slots and confirm.`,
    rows: [
      { label: 'Customer',     value: customerEmail || 'unknown' },
      { label: 'Tier',         value: tierLabel },
      { label: 'Duration',     value: `${r.duration_minutes} minutes` },
      { label: 'Timezone',     value: r.timezone || 'not set' },
      { label: 'Submitted',    value: submittedAt },
      { label: 'Slots offered', html: slotsHtml },
      { label: 'Agenda',       html: `<div style="white-space:pre-wrap;">${escapeHtml(r.agenda || '')}</div>` },
      { label: 'Booking ID',   value: r.id },
    ],
    footnote: 'Reply directly to this email to reach the customer. Set status = confirmed + confirmed_slot + meeting_url in the row to push the confirmation into their workspace.',
  });
  const teamRes = await sendEmail({
    to: TEAM_EMAIL,
    subject: `[Consulting] ${tierLabel} (${r.duration_minutes}min) — ${customerEmail || 'new booking'}`,
    html: teamHtml,
    text: `New consulting booking from ${customerEmail}. Tier: ${tierLabel}. Duration: ${r.duration_minutes} min. Agenda:\n\n${r.agenda}\n\nSlots offered:\n${slotsList.join('\n')}\n\nBooking ID: ${r.id}`,
    replyTo: customerEmail || undefined,
  });

  let custRes = { ok: true, skipped: true };
  if (customerEmail) {
    const custHtml = emailShell({
      title: 'Booking received.',
      intro: `Thanks. An operator will pick one of your proposed times and send a confirmed slot with a meeting link within 24 hours on business days.`,
      rows: [
        { label: 'Tier',     value: tierLabel },
        { label: 'Duration', value: `${r.duration_minutes} minutes` },
        { label: 'Slots you offered', html: slotsHtml },
      ],
      footnote: 'You can cancel any time from your Consulting page in the workspace. If none of these times still work, reply to this email with new ones.',
    });
    custRes = await sendEmail({
      to: customerEmail,
      subject: `Booking received — ${tierLabel}`,
      html: custHtml,
      text: `Thanks — we received your ${r.duration_minutes}-minute ${tierLabel} booking. An operator will confirm a slot within 24 hours.`,
      replyTo: TEAM_EMAIL,
    });
  }

  return res.status(200).json({
    ok: true,
    team:     { ok: teamRes.ok, error: teamRes.error || null },
    customer: { ok: custRes.ok, skipped: !!custRes.skipped, error: custRes.error || null },
  });
}

async function readRow(token, table, id) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { error: `Lookup failed: ${t.slice(0, 200)}`, status: 502 };
    }
    const data = await r.json();
    return { data: Array.isArray(data) ? data[0] : null };
  } catch (err) {
    return { error: 'Could not read row.', status: 500 };
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
