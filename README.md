# TAC Members — client portal PWA

Request a quote → desk prices it in the console → quote lands in the client's app (and inbox) → client accepts → jet card hours tracked live.

Runs entirely on Cloudflare Pages + Functions + D1. No servers, no frameworks, no build step.

```
index.html      client app (login → dashboard)
admin.html      desk console (protected by ADMIN_KEY)
schema.sql      D1 database schema
functions/api/  auth · me · request · accept · admin
manifest.webmanifest, sw.js, icons/   PWA bits
```

## One-time setup (~10 minutes)

**1. New repo + Pages project.** Put these files at the repo root and create a new
Cloudflare Pages project from it (e.g. `tac-members`). Deploy once so the project exists.

**2. Create the database.**
```
npx wrangler d1 create tac-members
npx wrangler d1 execute tac-members --remote --file=schema.sql
```
(Or create the D1 database in the dashboard and paste `schema.sql` into its console.)

**3. Bind it.** Pages project → Settings → Functions → **D1 database bindings** →
add binding, variable name **`DB`**, select the `tac-members` database. (Production and Preview.)

**4. Environment variables.** Settings → Environment variables:

| Variable | Required | What it is |
|---|---|---|
| `ADMIN_KEY` | yes | Long random string (16+ chars). The desk console password. |
| `RESEND_API_KEY` | for email | Free key from resend.com — sends login codes + quote notifications. |
| `MAIL_FROM` | optional | e.g. `TAC Members <members@tampaaircharter.com>` after verifying your domain in Resend. Defaults to Resend's test sender. |
| `DESK_EMAIL` | optional | Where new-request and acceptance alerts go (e.g. charter@willsmithaviation.com). |
| `DEV_MODE` | testing only | Set to `1` to show login codes on-screen before email is configured. **Remove in production.** |

**5. Redeploy** (Deployments → Retry, or push any commit) so bindings take effect.

## Day-to-day

- **Clients:** visit the app URL → email → 6-digit code → dashboard. Installable to
  the home screen like the main TAC site.
- **Desk:** open `/admin.html`, paste the ADMIN_KEY. Pending requests sit at the top —
  type an amount + note, **Send quote**. The request flips to *quoted*, the client gets
  an email, and the quote appears in their app with an **Accept** button.
- **Jet cards:** in the console, set a client's card terms once (tier, total hours, rate
  label), then log activity per flight (`-2.5`, "TPA → NAS · 06/14"). The client's app
  shows hours remaining with a fuel-gauge bar and recent activity.

## Notes & limits (MVP)

- Sign-in is passwordless email codes; any email can sign in and submit requests, but
  jet cards and quotes only exist where the desk creates them.
- Email is best-effort: if Resend isn't configured, quotes still appear in-app; only
  notifications are skipped. Login codes REQUIRE email (or DEV_MODE) by design.
- The status flow is pending → quoted → accepted → booked → closed; payments,
  contracts, and push notifications are deliberate phase-2 items.
- All API responses are no-cache; the service worker never touches `/api/`.
