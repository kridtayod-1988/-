import { json, fail, readJson, now, isEmail } from "../lib/http.js";
import { stripeRequest } from "../lib/stripe.js";
import { orderNumber, releaseOrder } from "../lib/orders.js";
import { randomToken, rateLimit, clientIp } from "../lib/security.js";
import { calcDiscount, couponError } from "./coupon.js";

const MAX_LINES = 20;
const MAX_QTY_PER_LINE = 10;
const PHONE_RE = /^0\d{8,9}$/;

export async function onRequestPost({ request, env }) {
  // กันสแปม/โจมตี: จำกัด 20 ครั้ง/ชั่วโมง/ไอพี (แนะนำเสริม WAF Rate Limiting)
  const rl = await rateLimit(env, `checkout:${clientIp(request)}`, 20, 3600000);
  if (!rl.ok) return fail("rate_limited", "มีคำขอชำระเงินหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง", 429);

  if (!env.STRIPE_SECRET_KEY) return fail("payment_not_configured", "ระบบชำระเงินยังไม่ได้ตั้งค่า (STRIPE_SECRET_KEY)", 500);

  const body = await readJson(request);
  if (!body) return fail("bad_request", "รูปแบบข้อมูลไม่ถูกต้อง");

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0 || items.length > MAX_LINES) return fail("bad_items", "ตะกร้าว่างเปล่า หรือมีรายการเกินจำนวนที่รองรับ (สูงสุด 20 รายการ)");
  if (body.consent !== true) return fail("no_consent", "กรุณายอมรับเงื่อนไขและนโยบายความเป็นส่วนตัว (PDPA)");

  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  if (!isEmail(email) || email.length > 200) return fail("bad_email", "อีเมลไม่ถูกต้อง");
  if (name.length < 2 || name.length > 120) return fail("bad_name", "กรุณากรอกชื่อ-นามสกุล");

  const payment = body.payment_method === "promptpay" ? "promptpay" : body.payment_method === "card" ? "card" : null;
  if (!payment) return fail("bad_payment", "กรุณาเลือกวิธีชำระเงิน");

  const slugs = items.map((i) => String(i?.slug || ""));
  const qtys = items.map((i) => Number(i?.qty));
  if (slugs.some((s) => !s) || qtys.some((q) => !Number.isInteger(q) || q < 1 || q > MAX_QTY_PER_LINE)) {
    return fail("bad_items", "รายการสินค้าไม่ถูกต้อง");
  }

  const { results } = await env.DB.prepare(
    `SELECT id, slug, name, type, price_thb, stock, file_key, access_url
     FROM products WHERE slug IN (${slugs.map(() => "?").join(",")}) AND active = 1 AND deleted = 0`
  ).bind(...slugs).all();
  const bySlug = new Map(results.map((p) => [p.slug, p]));

  const lines = [];
  let subtotal = 0;
  let hasPhysical = false;
  for (let i = 0; i < items.length; i++) {
    const p = bySlug.get(slugs[i]);
    if (!p) return fail("product_missing", "มีสินค้าบางรายการหมดหรือถูกปิดขายแล้ว กรุณาตรวจตะกร้าอีกครั้ง", 409);
    if (p.type === "digital") {
      if (qtys[i] !== 1) return fail("digital_qty", "สินค้าดิจิทัลซื้อได้ครั้งละ 1 ชิ้น");
      if (!p.file_key && !p.access_url) return fail("digital_not_ready", `สินค้า “${p.name}” ยังไม่พร้อมขาย`);
      lines.push({ ...p, qty: 1 });
    } else {
      hasPhysical = true;
      if (p.stock === null || p.stock < qtys[i]) return fail("out_of_stock", `สินค้า “${p.name}” มีไม่พอ (คงเหลือ ${p.stock ?? 0} ชิ้น)`, 409);
      lines.push({ ...p, qty: qtys[i] });
    }
    subtotal += p.price_thb * lines[lines.length - 1].qty;
  }

  const FEE = Math.max(0, Math.round(Number(env.SHIPPING_FEE_THB ?? 40)));
  const FREE_FROM = Math.max(0, Math.round(Number(env.FREE_SHIPPING_FROM_THB ?? 800)));
  const shipping = hasPhysical && subtotal < FREE_FROM ? FEE : 0;

  let discount = 0;
  let coupon = null;
  const couponCode = String(body.coupon_code || "").trim().toUpperCase();
  if (couponCode) {
    coupon = await env.DB.prepare(`SELECT * FROM coupons WHERE code = ? AND active = 1 AND deleted = 0`).bind(couponCode).first();
    const cerr = couponError(coupon, subtotal);
    if (cerr) return fail(cerr.code, cerr.message, 409);
    discount = calcDiscount(coupon, subtotal);
  }

  const total = subtotal - discount + shipping;
  const MIN_ORDER = Math.max(1, Math.round(Number(env.MIN_ORDER_THB ?? 10)));
  if (total < MIN_ORDER) return fail("min_order", `ยอดสั่งซื้อขั้นต่ำคือ ฿${MIN_ORDER}`);

  let address = "", subdistrict = "", district = "", province = "", postcode = "";
  if (hasPhysical) {
    if (!PHONE_RE.test(phone)) return fail("bad_phone", "เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0812345678)");
    address = String(body.address || "").trim();
    subdistrict = String(body.subdistrict || "").trim();
    district = String(body.district || "").trim();
    province = String(body.province || "").trim();
    postcode = String(body.postcode || "").trim();
    if (address.length < 5 || address.length > 300 || subdistrict.length < 2 || district.length < 2 || province.length < 2) {
      return fail("bad_address", "กรุณากรอกที่อยู่จัดส่งให้ครบถ้วน");
    }
    if (!/^\d{5}$/.test(postcode)) return fail("bad_postcode", "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก");
  }

  const orderId = crypto.randomUUID();
  const number = orderNumber();
  const cancelToken = randomToken(24);
  const ts = now();

  try {
    const stmts = [
      env.DB.prepare(
        `INSERT INTO orders (id, number, cancel_token, status, payment_method, email, name, phone,
           address, addr_subdist, addr_district, addr_province, addr_postcode,
           subtotal_thb, shipping_thb, discount_thb, total_thb, coupon_code, coupon_id,
           created_at, updated_at)
         VALUES (?1, ?2, ?3, 'pending', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?19)`
      ).bind(orderId, number, cancelToken, payment, email, name, phone, address, subdistrict, district, province, postcode, subtotal, shipping, discount, total, coupon ? coupon.code : null, coupon ? coupon.id : null, ts),
    ];
    for (const l of lines) {
      stmts.push(env.DB.prepare(
        `INSERT INTO order_items (id, order_id, product_id, name_snapshot, type, qty, price_thb)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(crypto.randomUUID(), orderId, l.id, l.name, l.type, l.qty, l.price_thb));
      if (l.type === "physical") {
        stmts.push(env.DB.prepare(
          `UPDATE products SET stock = stock - ?1, updated_at = ?2 WHERE id = ?3 AND active = 1 AND deleted = 0`
        ).bind(l.qty, ts, l.id));
        stmts.push(env.DB.prepare(
          `INSERT INTO stock_movements (id, product_id, delta, reason, order_id, created_at)
           VALUES (?1, ?2, ?3, 'reserve', ?4, ?5)`
        ).bind(crypto.randomUUID(), l.id, -l.qty, orderId, ts));
      }
    }
    await env.DB.batch(stmts);
  } catch (e) {
    if (/CHECK constraint/i.test(String(e?.message || ""))) {
      return fail("out_of_stock", "ขออภัย สินค้าบางรายการถูกจองพอดีแล้ว กรุณาลดจำนวนหรือลองใหม่", 409);
    }
    throw e;
  }

  const ttl = Math.min(86400, Math.max(1800, Math.round(Number(env.CHECKOUT_TTL_SECONDS ?? 3600))));
  const lineItems = lines.map((l) => ({
    quantity: l.qty,
    price_data: { currency: "thb", unit_amount: l.price_thb * 100, product_data: { name: l.name.slice(0, 120) } },
  }));
  if (shipping > 0) {
    lineItems.push({ quantity: 1, price_data: { currency: "thb", unit_amount: shipping * 100, product_data: { name: "ค่าจัดส่ง" } } });
  }

  let stripeDiscount;
  if (discount > 0 && coupon) {
    try {
      const sc = await stripeRequest(env, "POST", "/coupons", {
        duration: "once",
        amount_off: discount * 100,
        currency: "thb",
        name: `ส่วนลด (${coupon.code})`,
        metadata: { order_number: number },
      });
      stripeDiscount = [{ coupon: sc.id }];
    } catch (e) {
      await releaseOrder(env, orderId, "failed");
      return fail("coupon_failed", "ใช้โค้ดส่วนลดไม่สำเร็จ กรุณาลองใหม่หรือไม่ใส่โค้ด", 502);
    }
  }

  const origin = new URL(request.url).origin;
  let session;
  try {
    session = await stripeRequest(env, "POST", "/checkout/sessions", {
      mode: "payment",
      payment_method_types: [payment],
      locale: "th",
      customer_email: email,
      client_reference_id: number,
      expires_at: Math.floor(now() / 1000) + ttl,
      success_url: `${origin}/order/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart?cancel=${cancelToken}`,
      metadata: { order_id: orderId, order_number: number },
      line_items: lineItems,
      discounts: stripeDiscount,
    });
  } catch (e) {
    await releaseOrder(env, orderId, "failed");
    return fail("payment_init", `เปิดหน้าชำระเงินไม่สำเร็จ: ${e.message}`, 502);
  }

  if (coupon) {
    await env.DB.prepare(`UPDATE coupons SET used_count = used_count + 1, updated_at = ?2 WHERE id = ?1`).bind(coupon.id, now()).run();
  }
  await env.DB.prepare(`UPDATE orders SET session_id = ?2, updated_at = ?3 WHERE id = ?1`).bind(orderId, session.id, now()).run();
  return json({ ok: true, url: session.url, order_number: number, total_thb: total });
}
