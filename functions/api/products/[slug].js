import { json, fail } from "../lib/http.js";
import { PUBLIC_COLUMNS, publicProduct, shippingFrom } from "../products.js";

export async function onRequestGet({ params, env }) {
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_COLUMNS} FROM products WHERE slug = ? AND active = 1 AND deleted = 0 LIMIT 1`
  ).bind(params.slug).all();
  if (!results.length) return fail("not_found", "ไม่พบสินค้านี้ หรือสินค้าถูกปิดขายแล้ว", 404);
  return json({ ok: true, product: publicProduct(results[0]), shipping: shippingFrom(env) });
}
