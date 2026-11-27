// GET /api/coupon?code=X&subtotal=1234 — ตรวจโค้ดส่วนลด (จำกัด 30 ครั้ง/10 นาที/ไอพี กันเดาโค้ด)
import { json, fail } from "../lib/http.js";
import { rateLimit, clientIp } from "../lib/security.js";

export function calcDiscount(c, subtotal) {
  if (c.kind === "percent") {
    let d = Math.round(subtotal * c.value / 100);
    if (c.max_discount_thb != null) d = Math.min(d, c.max_discount_thb);
    return Math.max(0, Math.min(d, subtotal));
  }
  return Math.max(0, Math.min(c.value, subtotal));
}

export function couponError(c, subtotal) {
  const now = Date.now();
  if (!c) return { code: "not_found", message: "ไม่พบโค้ดส่วนลดนี้" };
  if (c.starts_at && now < c.starts_at) return { code: "not_started", message: "โค้ดนี้ยังไม่เริ่มใช้ได้" };
  if (c.ends_at && now > c.ends_at) return { code: "expired", message: "โค้ดนี้หมดอายุแล้ว" };
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return { code: "used_up", message: "โค้ดนี้ถูกใช้ครบจำนวนแล้ว" };
  if (subtotal < c.min_subtotal_thb) return { code: "min_subtotal", message: `โค้ดนี้ใช้ได้เมื่อยอดสั่งซื้อถึง ฿${c.min_subtotal_thb.toLocaleString("th-TH")}` };
  return null;
}

export async function onRequestGet({ request, env }) {
  const rl = await rateLimit(env, `coupon:${clientIp(request)}`, 30, 600000);
  if (!rl.ok) return fail("rate_limited", "ตรวจโค้ดหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง", 429);

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();
  const subtotal = Number(url.searchParams.get("subtotal") || 0);
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) return fail("bad_code", "รูปแบบโค้ดไม่ถูกต้อง");
  if (!Number.isInteger(subtotal) || subtotal < 0) return fail("bad_subtotal", "ยอดสินค้าไม่ถูกต้อง");
  const c = await env.DB.prepare(`SELECT * FROM coupons WHERE code = ? AND active = 1 AND deleted = 0`).bind(code).first();
  const err = couponError(c, subtotal);
  if (err) return fail(err.code, err.message, 404);
  return json({ ok: true, discount_thb: calcDiscount(c, subtotal) });
}
