// POST /api/consulting-notify
//
// Called by the browser immediately after a consulting_bookings row is
// inserted. Sends two emails:
//   1. To the HelveX team: "new booking, here are the proposed slots,
//      pick one and reply"
//   2. To the customer: "we got it, expect a confirmed slot within 24h"
//
// Reads the row server-side using the caller's JWT (RLS verifies
// they're the owner).

import { requireUser, SUPABASE_URL, SUPABASE_ANON } from './_lib/auth.js';
import { sendEmail, emailShell, TEAM_EMAIL, escapeHtml } from './_lib/email.js';

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
  const bookingId = (body && body.booking_id) ? String(body.booking_id) : '';
  if (!bookingId) return res.status(400).json({ error: 'booking_id required' });

  let row;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/consulting_bookings?id=eq.${encodeURIComponent(bookingId)}&select=*`, {
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
    return res.status(500).json({ error: 'Could not read booking.' });
  }

  if (!row) return res.status(404).json({ error: 'Booking not found or not yours.' });

  const customerEmail = auth.user.email;
  const tierLabel     = TIER_LABEL[row.plan_tier] || row.plan_tier;
  const submittedAt   = new Date(row.created_at).toLocaleString();
  const slots         = Array.isArray(row.preferred_slots) ? row.preferred_slots : [];
  const slotsList     = slots.map((s) => {
    try { return new Date(s).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return s; }
  });

  // ── Team notification ───────────────────────────────────────────
  const teamHtml = emailShell({
    title: `New consulting booking — ${tierLabel}`,
    intro: `${customerEmail || 'A customer'} requested a ${row.duration_minutes}-minute session. Pick one of their slots and confirm.`,
    rows: [
      { label: 'Customer',    value: customerEmail || 'unknown' },
      { label: 'Tier',        value: tierLabel },
      { label: 'Duration',    value: `${row.duration_minutes} minutes` },
      { label: 'Timezone',    value: row.timezone || 'not set' },
      { label: 'Submitted',   value: submittedAt },
      { label: 'Slots offered', html: slotsList.length
          ? slotsList.map((s) => `<div style="display:inline-block;margin:2px 4px 2px 0;padding:4px 9px;background:#f5f5f5;border-radius:6px;font-family:monospace;font-size:12px;">${escapeHtml(s)}</div>`).join('')
          : '<em>none — customer left this blank</em>' },
      { label: 'Agenda',      html: `<div style="white-space:pre-wrap;">${escapeHtml(row.agenda || '')}</div>` },
      { label: 'Booking ID',  value: row.id },
    ],
    footnote: 'Reply directly to this email to reach the customer. Set status = confirmed + confirmed_slot + meeting_url in the row to push the confirmation into their workspace.',
  });
  const teamRes = await sendEmail({
    to: TEAM_EMAIL,
    subject: `[Consulting] ${tierLabel} (${row.duration_minutes}min) — ${customerEmail || 'new booking'}`,
    html: teamHtml,
    text: `New consulting booking from ${customerEmail}. Tier: ${tierLabel}. Duration: ${row.duration_minutes} min. Agenda:\n\n${row.agenda}\n\nSlots offered:\n${slotsList.join('\n')}\n\nBooking ID: ${row.id}`,
    replyTo: customerEmail || undefined,
  });

  // ── Customer confirmation ───────────────────────────────────────
  let custRes = { ok: true, skipped: true };
  if (customerEmail) {
    const custHtml = emailShell({
      title: 'Booking received.',
      intro: `Thanks. An operator will pick one of your proposed times and send a confirmed slot with a meeting link within 24 hours on business days.`,
      rows: [
        { label: 'Tier',       value: tierLabel },
        { label: 'Duration',   value: `${row.duration_minutes} minutes` },
        { label: 'Slots you offered', html: slotsList.length
            ? slotsList.map((s) => `<div style="display:inline-block;margin:2px 4px 2px 0;padding:4px 9px;background:#f5f5f5;border-radius:6px;font-family:monospace;font-size:12px;">${escapeHtml(s)}</div>`).join('')
            : '<em>none</em>' },
        { label: 'Track at',   html: '<a href="https://www.helvex.com/consulting" style="color:#0f0f10;">helvex.com/consulting</a>' },
      ],
      footnote: 'You can cancel any time from your Consulting page in the workspace. If none of these times still work, reply to this email with new ones.',
    });
    custRes = await sendEmail({
      to: customerEmail,
      subject: `Booking received — ${tierLabel}`,
      html: custHtml,
      text: `Thanks — we received your ${row.duration_minutes}-minute ${tierLabel} booking. An operator will confirm a slot within 24 hours. Track at helvex.com/consulting.`,
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
