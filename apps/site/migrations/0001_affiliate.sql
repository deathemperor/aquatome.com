-- Affiliate catalog: concrete listings (filled once network accounts exist), click aggregates, checker log.
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  price_vnd INTEGER,
  image TEXT,
  category TEXT NOT NULL,
  entity_ref TEXT,
  keyword TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  fail_count INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX products_placement ON products (network, status, entity_ref, category);
CREATE INDEX products_keyword ON products (network, status, keyword);

CREATE TABLE clicks_daily (
  date TEXT NOT NULL,
  network TEXT NOT NULL,
  category TEXT NOT NULL,
  entity_ref TEXT NOT NULL,
  product_id TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, network, category, entity_ref, product_id)
);

CREATE TABLE checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  at TEXT NOT NULL,
  result TEXT NOT NULL,
  detail TEXT
);
