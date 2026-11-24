import { json } from "../lib/http.js";
import { verifyStripeSignature } from "../lib/stripe.js";
import { markOrderPaid, releaseOrder } from "../lib/orders.js";
import { notifyOrderPaid } from "../lib/notify.js";

export async function onRequestPost({ request, env }) {
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  if (!env.STRIPE_WEBHOOK_SECRET || !(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("invalid signature", { status: 400 });
  }
  let event;
  try { event = JSON.parse(payload); } catch { return new Response("bad payload", { status: 400 }); }

  const session = event?.data?.object;
  switch (event.type) {
    case "checkout.session.completed":
      if (session?.payment_status === "paid") await fulfill(env, session); // 'unpaid' → รอ async webhook
      break;
    case "checkout.session.async_payment_succeeded":
      await fulfill(env, session);
      break;
    case "checkout.session.async_payment_failed":
      if (session?.metadata?.order_id) await releaseOrder(env, session.metadata.order_id, "failed");
      break;
    case "checkout.session.expired":
      if (session?.metadata?.order_id) await releaseOrder(env, session.metadata.order_id, "expired");
      break;
  }
  return json({ received: true });
}

async function fulfill(env, session) {
  const orderId = session?.metadata?.order_id;
  if (!orderId) return;
  const order = await env.DB.prepare(`SELECT id, total_thb FROM orders WHERE id = ?`).bind(orderId).first();
  if (!order) return;
  // กันกรณียอด/สกุลเงินไม่ตรงกับในฐานข้อมูล
  if (Number(session.amount_total) !== order.total_thb * 100 || String(session.currency || "thb") !== "thb") return;
  const changed = await markOrderPaid(env, orderId, session.payment_method_types?.[0] || "unknown");
  if (changed) { try { await notifyOrderPaid(env, orderId); } catch {} }
}
