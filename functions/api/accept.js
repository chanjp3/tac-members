// POST /api/accept — client accepts a quote on their own request { request_id }
import { json, bad, currentClient, sendEmail } from './_utils.js';

export async function onRequestPost(context) {
  const client = await currentClient(context);
  if (!client) return bad('not signed in', 401);
  const { env } = context;
  let b;
  try { b = await context.request.json(); } catch { return bad('bad json'); }

  const req = await env.DB.prepare('SELECT * FROM requests WHERE id=?1 AND client_id=?2')
    .bind(String(b.request_id || ''), client.id).first();
  if (!req) return bad('no such request');
  if (req.status !== 'quoted') return bad('nothing to accept yet');

  await env.DB.prepare("UPDATE requests SET status='accepted' WHERE id=?1").bind(req.id).run();

  if (env.DESK_EMAIL) {
    await sendEmail(env, env.DESK_EMAIL,
      `QUOTE ACCEPTED — ${req.from_ap} → ${req.to_ap}`,
      `${client.name || client.email} accepted the quote for ${req.from_ap} → ${req.to_ap} (${req.depart_date || 'date TBD'}).\n` +
      `Contact: ${client.email}${client.phone ? ', ' + client.phone : ''}\n\nConfirm and book in the admin console.`);
  }
  return json({ ok: true });
}
