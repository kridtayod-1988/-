import { json, fail, readJson } from "../lib/http.js";
import { stripeRequest } from "../lib/stripe.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const token = String(body?.token || "");
  if (!token) return fail("bad_request", "ข้อมูลไม่ครบถ้วน");
  const order = await env.DB.prepare(`SELECT id, session_id, status FROM orders WHERE cancel_token = ?`).bind(token).first();
  if (!order) return fail("not_found", "ไม่พบคำสั่งซื้อ", 404);
  if (order.status !== "pending" || !order.session_id) return json({ ok: true, status: order.status });
  try {
    await stripeRequest(env, "POST", `/checkout/sessions/${order.session_id}/expire`, {});
  } catch { /* ถ้าลูกค้าจ่ายไปแล้ว Stripe จะ reject — ให้ webhook จัดการต่อ */ }
  return json({ ok: true, status: "cancelling" });
}
