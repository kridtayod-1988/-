CREATE TABLE IF NOT EXISTS products (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('physical','digital')),
  category     TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  price_thb    INTEGER NOT NULL CHECK (price_thb >= 1),
  compare_at   INTEGER CHECK (compare_at IS NULL OR compare_at >= 1),
  stock        INTEGER CHECK (stock IS NULL OR stock >= 0),
  image_key    TEXT,
  file_key     TEXT,
  file_name    TEXT,
  access_url   TEXT,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  deleted      INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products (active, deleted);

-- ── คูปองส่วนลด ──
CREATE TABLE IF NOT EXISTS coupons (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  kind             TEXT NOT NULL CHECK (kind IN ('percent','fixed')),
  value            INTEGER NOT NULL CHECK (value >= 1),
  min_subtotal_thb INTEGER NOT NULL DEFAULT 0 CHECK (min_subtotal_thb >= 0),
  max_discount_thb INTEGER,
  usage_limit      INTEGER,
  used_count       INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  starts_at        INTEGER,
  ends_at          INTEGER,
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  deleted          INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  number        TEXT NOT NULL UNIQUE,
  session_id    TEXT UNIQUE,
  cancel_token  TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','shipped','expired','failed')),
  payment_method TEXT,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  addr_subdist  TEXT NOT NULL DEFAULT '',
  addr_district TEXT NOT NULL DEFAULT '',
  addr_province TEXT NOT NULL DEFAULT '',
  addr_postcode TEXT NOT NULL DEFAULT '',
  subtotal_thb  INTEGER NOT NULL CHECK (subtotal_thb >= 0),
  shipping_thb  INTEGER NOT NULL DEFAULT 0 CHECK (shipping_thb >= 0),
  discount_thb  INTEGER NOT NULL DEFAULT 0 CHECK (discount_thb >= 0),
  total_thb     INTEGER NOT NULL CHECK (total_thb >= 1),
  coupon_code   TEXT,
  coupon_id     TEXT,
  shipping_provider TEXT,
  pickup_status TEXT NOT NULL DEFAULT '',
  pickup_at     INTEGER,
  tracking_number TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id),
  product_id   TEXT NOT NULL REFERENCES products(id),
  name_snapshot TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('physical','digital')),
  qty          INTEGER NOT NULL CHECK (qty >= 1),
  price_thb    INTEGER NOT NULL CHECK (price_thb >= 1)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS download_tokens (
  token         TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL UNIQUE REFERENCES order_items(id),
  expires_at    INTEGER NOT NULL,
  max_uses      INTEGER NOT NULL DEFAULT 20,
  use_count     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  order_id   TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_id);

-- ── ตั้งค่าร้าน (ธีมสี / ขนส่ง / อีเมล / LINE OA) เก็บเป็น JSON ──
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ── สมุดรายรับ-รายจ่าย (สำหรับสรุปยอดและยื่นภาษี) ──
CREATE TABLE IF NOT EXISTS transactions (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('income','expense')),
  category    TEXT NOT NULL DEFAULT '',
  amount_thb  INTEGER NOT NULL CHECK (amount_thb >= 0),
  note        TEXT NOT NULL DEFAULT '',
  occurred_on TEXT NOT NULL,              -- วันที่ (YYYY-MM-DD, เวลาไทย)
  order_id    TEXT,                       -- ถ้ามาจากออเดอร์ = ลบไม่ได้
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions (order_id);

-- ── ผู้ใช้ LINE ที่ผูกคำสั่งซื้อไว้ (สำหรับแจ้งเตือนรายบุคคล) ──
CREATE TABLE IF NOT EXISTS line_users (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  bound_email  TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
