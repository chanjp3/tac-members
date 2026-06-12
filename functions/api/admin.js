// POST /api/admin — desk console API, guarded by X-Admin-Key header (env ADMIN_KEY)
// actions:
//   list                       -> clients + open requests overview
//   client {email,name,phone}  -> create/update a client by email
//   setcard {email,tier,hours_total,rate_label}        -> create/replace card terms
//   adjust  {email,delta_hours,note}                   -> log card activity (negative = flown)
//   quote   {request_id,amount,message,valid_until}    -> post a quote (status -> quoted, emails client)
//   status  {request_id,status}                        -> pending|quoted|accepted|booked|closed
import { json, bad, requireAdmin, sendEmail } from './_utils.js';

export async function onRequestPost(context) {
  if (!requireAdmin(context)) return bad('unauthorized (set ADMIN_KEY env var, send X-Admin-Key header)', 401);
  const { env } = context;
  let b;
  try { b = await context.request.json(); } catch { return bad('bad json'); }
  const action = b.action || '';

  if (action === 'list') {
    const clients = (await env.DB.prepare(
      `SELECT c.id, c.email, c.name, c.phone, c.created_at,
              j.tier, j.hours_total, j.hours_used, j.rate_label
       FROM clients c LEFT JOIN jetcards j ON j.client_id = c.id
       ORDER BY c.created_at DESC LIMIT 500`
    ).all()).results;
    const requests = (await env.DB.prepare(
      `SELECT r.*, c.email, c.name FROM requests r JOIN clients c ON c.id = r.client_id
       ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'quoted' THEN 1 WHEN 'accepted' THEN 2 ELSE 3 END,
                r.created_at DESC LIMIT 200`
    ).all()).results;
    return json({ ok: true, clients, requests });
  }

  if (action === 'client') {
    const email = String(b.email || '').trim().toLowerCase();
    if (!email) return bad('email required');
    let c = await env.DB.prepare('SELECT * FROM clients WHERE email=?1').bind(email).first();
    if (!c) {
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO clients (id,email,name,phone) VALUES (?1,?2,?3,?4)')
        .bind(id, email, String(b.name || ''), String(b.phone || '')).run();
      return json({ ok: true, created: true, id });
    }
    await env.DB.prepare('UPDATE clients SET name=COALESCE(?1,name), phone=COALESCE(?2,phone) WHERE id=?3')
      .bind(b.name ?? null, b.phone ?? null, c.id).run();
    return json({ ok: true, created: false, id: c.id });
  }

  // helpers below need a client by email
  async function clientByEmail(email) {
    return env.DB.prepare('SELECT * FROM clients WHERE email=?1')
      .bind(String(email || '').trim().toLowerCase()).first();
  }

  if (action === 'setcard') {
    const c = await clientByEmail(b.email);
    if (!c) return bad('no such client');
    await env.DB.prepare(
      `INSERT INTO jetcards (client_id,tier,hours_total,hours_used,rate_label,updated_at)
       VALUES (?1,?2,?3,COALESCE((SELECT hours_used FROM jetcards WHERE client_id=?1),0),?4,datetime('now'))
       ON CONFLICT(client_id) DO UPDATE SET tier=?2, hours_total=?3, rate_label=?4, updated_at=datetime('now')`
    ).bind(c.id, String(b.tier || ''), Number(b.hours_total || 0), String(b.rate_label || '')).run();
    return json({ ok: true });
  }

  if (action === 'adjust') {
    const c = await clientByEmail(b.email);
    if (!c) return bad('no such client');
    const delta = Number(b.delta_hours);
    if (!isFinite(delta) || delta === 0) return bad('delta_hours must be a non-zero number');
    const card = await env.DB.prepare('SELECT * FROM jetcards WHERE client_id=?1').bind(c.id).first();
    if (!card) return bad('client has no jet card — setcard first');
    await env.DB.prepare('UPDATE jetcards SET hours_used = hours_used - ?1, updated_at=datetime(\'now\') WHERE client_id=?2')
      .bind(delta, c.id).run(); // delta negative (flown) increases hours_used
    await env.DB.prepare('INSERT INTO card_tx (client_id, delta_hours, note) VALUES (?1,?2,?3)')
      .bind(c.id, delta, String(b.note || '')).run();
    return json({ ok: true });
  }

  if (action === 'quote') {
    const req = await env.DB.prepare(
      'SELECT r.*, c.email AS client_email, c.name AS client_name FROM requests r JOIN clients c ON c.id=r.client_id WHERE r.id=?1'
    ).bind(String(b.request_id || '')).first();
    if (!req) return bad('no such request');
    const amount = String(b.amount || '').trim();
    if (!amount) return bad('amount required');
    await env.DB.prepare('INSERT INTO quotes (request_id, amount, message, valid_until) VALUES (?1,?2,?3,?4)')
      .bind(req.id, amount, String(b.message || ''), String(b.valid_until || '')).run();
    await env.DB.prepare("UPDATE requests SET status='quoted' WHERE id=?1").bind(req.id).run();
    await sendEmail(env, req.client_email,
      `Your quote is ready — ${req.from_ap} → ${req.to_ap}`,
      `Hi ${req.client_name || ''},\n\nYour Tampa Air Charter quote is ready:\n\n` +
      `${req.from_ap} → ${req.to_ap}\n${amount}${b.valid_until ? `\nValid until ${b.valid_until}` : ''}\n\n` +
      `${b.message || ''}\n\nOpen the TAC Members app to review and accept.\n\n— Tampa Air Charter · (813) 421-9070`);
    return json({ ok: true });
  }

  if (action === 'status') {
    const allowed = ['pending', 'quoted', 'accepted', 'booked', 'closed'];
    if (!allowed.includes(b.status)) return bad('bad status');
    await env.DB.prepare('UPDATE requests SET status=?1 WHERE id=?2')
      .bind(b.status, String(b.request_id || '')).run();
    return json({ ok: true });
  }

  return bad('unknown action');
}
