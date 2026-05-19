// Shared email-sending helper. Wraps the Resend HTTP API so every
// notify endpoint stays a one-line call. Resend is preferred because
// the project already configures RESEND_API_KEY for auth flows.
//
// Env vars expected on Vercel:
//   RESEND_API_KEY         — re_xxx... from https://resend.com/api-keys
//   HELVEX_TEAM_EMAIL      — where customer-action notifications go
//                            (e.g. "team@helvex.com"). Defaults to
//                            info@helvex.com if unset.
//   HELVEX_FROM_EMAIL      — what the From: header reads. Must be a
//                            domain Resend has verified. Defaults to
//                            "HelveX <info@helvex.com>".
//
// All functions return { ok, id?, error? } and never throw — the
// caller decides whether to surface a notification failure to the
// user or just log it. Notification email is non-critical: the row
// in the DB is the source of truth.

export const TEAM_EMAIL = process.env.HELVEX_TEAM_EMAIL || 'info@helvex.com';
export const FROM_EMAIL = process.env.HELVEX_FROM_EMAIL || 'HelveX <info@helvex.com>';

export async function sendEmail({ to, subject, html, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, error: 'RESEND_API_KEY not set on Vercel' };
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { ok: false, error: `Resend HTTP ${resp.status}: ${body.slice(0, 200)}` };
    }
    const data = await resp.json().catch(() => ({}));
    return { ok: true, id: data.id || null };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

/**
 * Shared email shell — dark header + branded sans body. Keeps every
 * notification visually consistent without needing each endpoint to
 * hand-roll its own markup.
 */
export function emailShell({ title, intro, rows, footnote }) {
  const rowHTML = (rows || [])
    .map((r) => `
      <tr>
        <td style="padding:6px 14px 6px 0;color:#9a9a9a;font-size:12.5px;vertical-align:top;white-space:nowrap;">${escapeHtml(r.label)}</td>
        <td style="padding:6px 0;color:#0f0f10;font-size:13.5px;line-height:1.55;">${r.html || escapeHtml(r.value || '—')}</td>
      </tr>`)
    .join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border:1px solid #e5e5e5;border-radius:14px;overflow:hidden;max-width:600px;">
        <tr><td style="background:#0f0f10;padding:18px 22px;">
          <div style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-0.01em;">HelveX</div>
        </td></tr>
        <tr><td style="padding:24px 26px 8px;">
          <h1 style="margin:0 0 10px;font-size:20px;font-weight:600;letter-spacing:-0.01em;color:#0f0f10;">${escapeHtml(title || '')}</h1>
          ${intro ? `<p style="margin:0 0 14px;font-size:13.5px;line-height:1.55;color:#525252;">${escapeHtml(intro)}</p>` : ''}
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #ececec;margin-top:8px;">
            ${rowHTML}
          </table>
        </td></tr>
        ${footnote ? `<tr><td style="padding:14px 26px 22px;color:#9a9a9a;font-size:11.5px;line-height:1.5;border-top:1px solid #ececec;">${escapeHtml(footnote)}</td></tr>` : ''}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { escapeHtml };
