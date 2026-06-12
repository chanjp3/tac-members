// POST /api/auth   { action: 'send', email }            -> emails a 6-digit code
// POST /api/auth   { action: 'verify', email, code }    -> sets session cookie
// POST /api/auth   { action: 'logout' }                 -> clears session
import { json, bad, randomToken, sixDigit, getCookie, sessionCookie, sendEmail } from './_utils.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { return bad('bad json'); }
  const action = body.action || '';

  if (action === 'logout') {
    const token = getCookie(request, 'tac_session');
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token=?1').bind(token).run();
    return json({ ok: true }, 200, { 'Set-Cookie': 'tac_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('valid email required');

  if (action === 'send') {
    // soft rate limit: max 5 codes per email per hour
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM login_codes WHERE email=?1 AND created_at > datetime('now','-1 hour')`
    ).bind(email).first();
    if (recent && recent.n >= 5) return bad('too many codes — try again later', 429);

    const code = sixDigit();
    await env.DB.prepare('DELETE FROM login_codes WHERE email=?1').bind(email).run();
    await env.DB.prepare(
      `INSERT INTO login_codes (email, code, expires_at) VALUES (?1, ?2, datetime('now','+10 minutes'))`
    ).bind(email, code).run();

    const mail = await sendEmail(env, email,
      'Your TAC Members sign-in code',
      `Your Tampa Air Charter sign-in code is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, you can ignore it.`);

    // DEV_MODE=1 returns the code in the response so the app can be tested before email is configured
    const dev = env.DEV_MODE === '1' ? { dev_code: code } : {};
    if (!mail.sent && env.DEV_MODE !== '1') return bad('email delivery is not configured — set RESEND_API_KEY (or DEV_MODE=1 for testing)', 503);
    return json({ ok: true, sent: mail.sent, ...dev });
  }

  if (action === 'verify') {
    const code = String(body.code || '').trim();
    const row = await env.DB.prepare(
      `SELECT rowid, * FROM login_codes WHERE email=?1 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1`
    ).bind(email).first();
    if (!row) return bad('code expired — request a new one');
    if (row.attempts >= 6) return bad('too many attempts — request a new code');
    if (row.code !== code) {
      await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE rowid=?1').bind(row.rowid).run();
      return bad('incorrect code');
    }
    await env.DB.prepare('DELETE FROM login_codes WHERE email=?1').bind(email).run();

    // find or auto-provision the client
    let client = await env.DB.prepare('SELECT * FROM clients WHERE email=?1').bind(email).first();
    if (!client) {
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO clients (id, email) VALUES (?1, ?2)').bind(id, email).run();
      client = { id, email, name: '' };
    }

    const token = randomToken();
    await env.DB.prepare(
      `INSERT INTO sessions (token, client_id, expires_at) VALUES (?1, ?2, datetime('now','+30 days'))`
    ).bind(token, client.id).run();

    return json({ ok: true, client: { email: client.email, name: client.name } }, 200, { 'Set-Cookie': sessionCookie(token) });
  }

  return bad('unknown action');
}
