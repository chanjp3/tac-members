-- TAC Members — D1 schema
-- Apply with:  npx wrangler d1 execute tac-members --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS clients (
  id          TEXT PRIMARY KEY,            -- uuid
  email       TEXT NOT NULL UNIQUE,
  name        TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now'))
);

-- one active jet card per client (MVP)
CREATE TABLE IF NOT EXISTS jetcards (
  client_id   TEXT PRIMARY KEY REFERENCES clients(id),
  tier        TEXT DEFAULT '',             -- e.g. "Tier 50"
  hours_total REAL DEFAULT 0,
  hours_used  REAL DEFAULT 0,
  rate_label  TEXT DEFAULT '',             -- e.g. "$3,900/hr locked"
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- jet card activity history
CREATE TABLE IF NOT EXISTS card_tx (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   TEXT NOT NULL REFERENCES clients(id),
  delta_hours REAL NOT NULL,               -- negative = hours flown
  note        TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requests (
  id          TEXT PRIMARY KEY,            -- uuid
  client_id   TEXT NOT NULL REFERENCES clients(id),
  from_ap     TEXT NOT NULL,
  to_ap       TEXT NOT NULL,
  depart_date TEXT DEFAULT '',
  return_date TEXT DEFAULT '',
  pax         TEXT DEFAULT '',
  notes       TEXT DEFAULT '',
  status      TEXT DEFAULT 'pending',      -- pending | quoted | accepted | booked | closed
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  TEXT NOT NULL REFERENCES requests(id),
  amount      TEXT NOT NULL,               -- display string, e.g. "$14,800 all-in"
  message     TEXT DEFAULT '',
  valid_until TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now'))
);

-- passwordless login codes
CREATE TABLE IF NOT EXISTS login_codes (
  email       TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_codes_email ON login_codes(email);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_client ON requests(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_request ON quotes(request_id);
