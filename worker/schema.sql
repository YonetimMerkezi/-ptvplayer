CREATE TABLE IF NOT EXISTS matches (
  k TEXT PRIMARY KEY,
  st TEXT NOT NULL,
  tid INTEGER,
  tp TEXT,
  ttl TEXT,
  yr INTEGER,
  cert TEXT,
  csrc TEXT,
  gen TEXT,
  w TEXT,
  conf REAL,
  cands TEXT,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_st ON matches(st);
