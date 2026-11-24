import { bangkokDate } from "./http.js";

const NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function orderNumber() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return "BP-" + [...b].map((x) => NUMBER_ALPHABET[x % NUMBER_ALPHABET.length]).join("");
}

function downloadExpiry(env) { return Date.now() + Math.max(1, Number(env.DOWNLOAD_EXPIRY_DAYS ?? 30)) * 86400000; }
function downloadMaxUses(env) { return Math.max(1, Math.round(Number(env.DOWNLOAD_MAX_USES ?? 20))); }

// ทำเครื่องหมายออเดอร์ว่าชำระแล้ว + ออกโทเคนดาวน์โหลด + บันทึกรายรับเข้าสมุดการเงิน
// ทำซ้ำได้ปลอดภัย (idempotent) — ทุกขั้นมีเงื่อนไขกันการทำซ้ำ
export async function markOrderPaid(env, orderId, paymentMethod) {
  const order = await env.DB.prepare(`SELECT id, number, total_thb FROM orders WHERE id = ?`).bind(orderId).first();
  if (!order) return false;
  const ts = Date.now();
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders SET status = 'paid', payment_method = ?2, updated_at = ?3 WHERE id = ?1 AND status = 'pending'`
    ).bind(orderId, paymentMethod, ts),
    env.DB.prepare(
      `INSERT OR IGNORE INTO download_tokens (token, order_item_id, expires_at, max_uses, use_count, created_at)
       SELECT lower(hex(randomblob(32))), oi.id, ?2, ?3, 0, ?4
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?1 AND oi.type = 'digital'
         AND (p.file_key IS NOT NULL OR p.access_url IS NOT NULL)
         AND EXISTS (SELECT 1 FROM orders o WHERE o.id = ?1 AND o.status IN ('paid','shipped'))`
    ).bind(orderId, downloadExpiry(env), downloadMaxUses(env), ts),
    // บันทึกรายรับเข้าสมุดการเงิน (ครั้งเดียวต่อออเดอร์)
    env.DB.prepare(
      `INSERT INTO transactions (id, kind, category, amount_thb, note, occurred_on, order_id, created_at)
       SELECT lower(hex(randomblob(16))), 'income', 'ขายสินค้า', ?2, ?3, ?4, ?1, ?5
       WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id = ?1 AND o.status IN ('paid','shipped'))
         AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.order_id = ?1)`
    ).bind(orderId, order.total_thb, `ขายสินค้า — ออเดอร์ ${order.number}`, bangkokDate(ts), ts),
  ]);
  return (results[0].meta.changes || 0) > 0;
}

// คืนสต๊อก + คืนสิทธิ์คูปอง เมื่อออเดอร์ยัง pending (กันคืนซ้ำจาก webhook ซ้ำ)
export async function releaseOrder(env, orderId, finalStatus = "expired") {
  const ts = Date.now();
  const order = await env.DB.prepare(`SELECT id, coupon_id FROM orders WHERE id = ?`).bind(orderId).first();
  const { results } = await env.DB.prepare(
    `SELECT oi.qty, oi.product_id FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?1 AND oi.type = 'physical'`
  ).bind(orderId).all();
  const stmts = [];
  for (const it of results) {
    stmts.push(env.DB.prepare(
      `UPDATE products SET stock = stock + ?1, updated_at = ?4 WHERE id = ?2
       AND EXISTS (SELECT 1 FROM orders o WHERE o.id = ?3 AND o.status = 'pending')`
    ).bind(it.qty, it.product_id, orderId, ts));
    stmts.push(env.DB.prepare(
      `INSERT INTO stock_movements (id, product_id, delta, reason, order_id, created_at)
       SELECT lower(hex(randomblob(16))), ?1, ?2, 'release', ?3, ?4
       WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id = ?3 AND o.status = 'pending')`
    ).bind(it.product_id, it.qty, orderId, ts));
  }
  if (order?.coupon_id) {
    stmts.push(env.DB.prepare(
      `UPDATE coupons SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END, updated_at = ?2
       WHERE id = ?1 AND EXISTS (SELECT 1 FROM orders o WHERE o.id = ?3 AND o.status = 'pending')`
    ).bind(order.coupon_id, ts, orderId));
  }
  stmts.push(env.DB.prepare(
    `UPDATE orders SET status = ?2, updated_at = ?3 WHERE id = ?1 AND status = 'pending'`
  ).bind(orderId, finalStatus, ts));
  await env.DB.batch(stmts);
}

export async function orderView(env, order) {
  const { results: items } = await env.DB.prepare(
    `SELECT oi.id, oi.name_snapshot AS name, oi.type, oi.qty, oi.price_thb AS price,
            p.slug, p.image_key, p.access_url
     FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
  ).bind(order.id).all();
  const { results: tokens } = await env.DB.prepare(
    `SELECT dt.order_item_id, dt.token, dt.expires_at, dt.max_uses, dt.use_count
     FROM download_tokens dt JOIN order_items oi ON oi.id = dt.order_item_id
     WHERE oi.order_id = ?`
  ).bind(order.id).all();
  const byItem = new Map(tokens.map((t) => [t.order_item_id, t]));
  const nowTs = Date.now();
  return {
    number: order.number,
    status: order.status,
    payment_method: order.payment_method || null,
    email: order.email,
    name: order.name,
    phone: order.phone || "",
    address: {
      line: order.address || "",
      subdistrict: order.addr_subdist || "",
      district: order.addr_district || "",
      province: order.addr_province || "",
      postcode: order.addr_postcode || "",
    },
    subtotal_thb: order.subtotal_thb,
    shipping_thb: order.shipping_thb,
    discount_thb: order.discount_thb || 0,
    coupon_code: order.coupon_code || null,
    total_thb: order.total_thb,
    tracking_number: order.tracking_number || null,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items: items.map((it) => {
      const tk = byItem.get(it.id);
      const usable = tk && tk.use_count < tk.max_uses && tk.expires_at > nowTs;
      return {
        name: it.name, type: it.type, qty: it.qty, price: it.price, slug: it.slug,
        image: it.image_key ? `/media/${it.image_key}` : null,
        access_url: it.type === "digital" ? (it.access_url || null) : null,
        download_url: usable ? `/api/download/${tk.token}` : null,
        downloads_left: tk ? Math.max(0, tk.max_uses - tk.use_count) : null,
      };
    }),
  };
}
