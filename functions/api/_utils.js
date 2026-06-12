// functions/api/_utils.js — shared helpers (not routed; underscore files are ignored by Pages routing)

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

export function bad(msg, status = 400) {
  return json({ ok: false, error: msg }, status);
}

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function sixDigit() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}

export function getCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

export function sessionCookie(token, maxAgeDays = 30) {
  const maxAge = maxAgeDays * 86400;
  return `tac_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function currentClient(context) {
  const token = getCookie(context.request, 'tac_session');
  if (!token) return null;
  const row = await context.env.DB.prepare(
    `SELECT c.* FROM sessions s JOIN clients c ON c.id = s.client_id
     WHERE s.token = ?1 AND s.expires_at > datetime('now')`
  ).bind(token).first();
  return row || null;
}

export function requireAdmin(context) {
  const key = context.request.headers.get('X-Admin-Key') || '';
  const expected = context.env.ADMIN_KEY || '';
  return expected.length >= 12 && key === expected;
}

// Email via Resend (https://resend.com). Optional: if no key, callers fall back.
export async function sendEmail(env, to, subject, text) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'no_key' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'TAC Members <onboarding@resend.dev>',
        to: [to],
        subject,
        text,
      }),
    });
    return { sent: res.ok };
  } catch {
    return { sent: false, reason: 'error' };
  }
}
