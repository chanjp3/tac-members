// GET /api/me — profile, jet card balance + history, requests with quotes
import { json, bad, currentClient } from './_utils.js';

export async function onRequestGet(context) {
  const client = await currentClient(context);
  if (!client) return bad('not signed in', 401);
  const { env } = context;

  const card = await env.DB.prepare('SELECT * FROM jetcards WHERE client_id=?1').bind(client.id).first();
  const tx = card
    ? (await env.DB.prepare(
        'SELECT delta_hours, note, created_at FROM card_tx WHERE client_id=?1 ORDER BY created_at DESC LIMIT 12'
      ).bind(client.id).all()).results
    : [];

  const requests = (await env.DB.prepare(
    'SELECT * FROM requests WHERE client_id=?1 ORDER BY created_at DESC LIMIT 50'
  ).bind(client.id).all()).results;

  const ids = requests.map((r) => r.id);
  let quotes = [];
  if (ids.length) {
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(',');
    quotes = (await env.DB.prepare(
      `SELECT * FROM quotes WHERE request_id IN (${placeholders}) ORDER BY created_at ASC`
    ).bind(...ids).all()).results;
  }
  const byReq = {};
  for (const q of quotes) (byReq[q.request_id] = byReq[q.request_id] || []).push(q);

  return json({
    ok: true,
    client: { email: client.email, name: client.name, phone: client.phone },
    jetcard: card
      ? {
          tier: card.tier,
          rate_label: card.rate_label,
          hours_total: card.hours_total,
          hours_used: card.hours_used,
          hours_left: Math.round((card.hours_total - card.hours_used) * 10) / 10,
          history: tx,
        }
      : null,
    requests: requests.map((r) => ({ ...r, quotes: byReq[r.id] || [] })),
  });
}

// POST /api/me — update own profile { name, phone }
export async function onRequestPost(context) {
  const client = await currentClient(context);
  if (!client) return bad('not signed in', 401);
  let body;
  try { body = await context.request.json(); } catch { return bad('bad json'); }
  const name = String(body.name || '').slice(0, 80);
  const phone = String(body.phone || '').slice(0, 32);
  await context.env.DB.prepare('UPDATE clients SET name=?1, phone=?2 WHERE id=?3')
    .bind(name, phone, client.id).run();
  return json({ ok: true });
}
