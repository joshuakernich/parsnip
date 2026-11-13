CREATE TABLE IF NOT EXISTS subs (
  id TEXT PRIMARY KEY,          -- sha-256 of the push endpoint
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  time TEXT NOT NULL,           -- local "HH:MM"
  tz TEXT NOT NULL,             -- IANA zone, e.g. Australia/Melbourne
  next_at INTEGER NOT NULL,     -- next send, epoch ms
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subs_next ON subs (next_at);
