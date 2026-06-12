// POST /api/request — submit a quote request
import { json, bad, currentClient, sendEmail } from './_utils.js';

export async function onRequestPost(context) {
  const client = await currentClient(context);
  if (!client) return bad('not signed in', 401);
  const { env } = context;
  let b;
  try { b = await context.request.json(); } catch { return bad('bad json'); }

  const from_ap = String(b.from || '').trim().slice(0, 60);
  const to_ap = String(b.to || '').trim().slice(0, 60);
  if (!from_ap || !to_ap) return bad('origin and destination are required');

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO requests (id, client_id, from_ap, to_ap, depart_date, return_date, pax, notes)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
  ).bind(
    id, client.id, from_ap, to_ap,
    String(b.depart || '').slice(0, 20),
    String(b.return || '').slice(0, 20),
    String(b.pax || '').slice(0, 12),
    String(b.notes || '').slice(0, 600)
  ).run();

  // notify the desk (best-effort)
  if (env.DESK_EMAIL) {
    await sendEmail(env, env.DESK_EMAIL,
      `New quote request — ${from_ap} → ${to_ap}`,
      `Client: ${client.name || client.email} (${client.email}${client.phone ? ', ' + client.phone : ''})\n` +
      `Route: ${from_ap} → ${to_ap}\nDepart: ${b.depart || '—'}  Return: ${b.return || '—'}  Pax: ${b.pax || '—'}\n` +
      `Notes: ${b.notes || '—'}\n\nQuote it in the admin console.`);
  }
  return json({ ok: true, id });
}
