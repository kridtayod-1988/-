import { json, fail, readJson, isEmail } from "../lib/http.js";
import { stripeRequest } from "../lib/stripe.js";
import { orderView, markOrderPaid, releaseOrder } from "../lib/orders.js";
import { notifyOrderPaid } from "../lib/notify.js";

async function findAndSync(env, order) {
  if (order.status === "pending" && order.session_id) {
    try {
      const s = await stripeRequest(env, "GET", `/checkout/sessions/${order.session_id}`);
      if (s.payment_status === "paid" && Number(s.amount_total) === order.total_thb * 100 && s.currency === "thb") {
        const changed = await markOrderPaid(env, order.id, s.payment_method_types?.[0] || "unknown");
        if (changed) { try { await notifyOrderPaid(env, order.id); } catch {} }
      } else if (s.status === "expired") {
        await releaseOrder(env, order.id, "expired");
      }
      order = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(order.id).first();
    } catch { /* ใช้สถานะในฐานข้อมูลเดิม */ }
  }
  return order;
}

export async function onRequestGet({ request, env }) {
  const session = new URL(request.url).searchParams.get("session");
  if (!session || !/^cs_(test|live)_/.test(session)) return fail("bad_request", "รหัสคำสั่งซื้อไม่ถูกต้อง");
  let order = await env.DB.prepare(`SELECT * FROM orders WHERE session_id = ?`).bind(session).first();
  if (!order) return fail("not_found", "ไม่พบคำสั่งซื้อ", 404);
  order = await findAndSync(env, order);
  return json({ ok: true, order: await orderView(env, order) });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const number = String(body?.number || "").trim().toUpperCase();
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^BP-[0-9A-Z]{8}$/.test(number) || !isEmail(email)) return fail("bad_request", "กรุณากรอกเลขคำสั่งซื้อและอีเมลให้ถูกต้อง");
  let order = await env.DB.prepare(`SELECT * FROM orders WHERE number = ? AND lower(email) = ?`).bind(number, email).first();
  if (!order) return fail("not_found", "ไม่พบคำสั่งซื้อที่ตรงกัน (ตรวจสอบเลขคำสั่งซื้อและอีเมลอีกครั้ง)", 404);
  order = await findAndSync(env, order);
  return json({ ok: true, order: await orderView(env, order) });
}
