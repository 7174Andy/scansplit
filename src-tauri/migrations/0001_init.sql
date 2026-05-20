CREATE TABLE transactions (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE transaction_people (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  position       INTEGER NOT NULL
);

CREATE TABLE receipts (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  image_path     TEXT NOT NULL,
  position       INTEGER NOT NULL,
  scanned_at     INTEGER NOT NULL
);

CREATE TABLE items (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  receipt_id     TEXT REFERENCES receipts(id) ON DELETE SET NULL,
  raw_code       TEXT,
  name           TEXT NOT NULL,
  price_cents    INTEGER NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'item' CHECK
                 (kind IN ('item','tax','tip','discount')),
  position       INTEGER NOT NULL
);

CREATE TABLE item_assignments (
  item_id        TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  person_id      TEXT NOT NULL REFERENCES transaction_people(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, person_id)
);

CREATE TABLE code_expansions (
  raw_code       TEXT NOT NULL,
  store_hint     TEXT,
  learned_name   TEXT NOT NULL,
  usage_count    INTEGER NOT NULL DEFAULT 1,
  last_used_at   INTEGER NOT NULL,
  PRIMARY KEY (raw_code, store_hint)
);

CREATE INDEX idx_items_transaction ON items(transaction_id);
CREATE INDEX idx_receipts_transaction ON receipts(transaction_id);
CREATE INDEX idx_assignments_item ON item_assignments(item_id);
