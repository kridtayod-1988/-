import { json } from "../lib/http.js";

export const PUBLIC_COLUMNS = "id, slug, name, type, category, description, price_thb, compare_at, stock, image_key, file_key, access_url, created_at";

export function shippingFrom(env) {
  return {
    fee: Math.max(0, Math.round(Number(env.SHIPPING_FEE_THB ?? 40))),
    free_from: Math.max(0, Math.round(Number(env.FREE_SHIPPING_FROM_THB ?? 800))),
  };
}

export function publicProduct(p) {
  const digital = p.type === "digital";
  return {
    slug: p.slug,
    name: p.name,
    type: p.type,
    category: p.category || "",
    description: p.description || "",
    price: p.price_thb,
    compare_at: p.compare_at || null,
    stock: digital ? null : p.stock,
    image: p.image_key ? `/media/${p.image_key}` : null,
    purchasable: digital ? Boolean(p.file_key || p.access_url) : (p.stock ?? 0) > 0,
    created_at: p.created_at,
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slugsParam = url.searchParams.get("slugs");
  const q = (url.searchParams.get("q") || "").trim();
  const type = url.searchParams.get("type");

  let sql = `SELECT ${PUBLIC_COLUMNS} FROM products WHERE active = 1 AND deleted = 0`;
  const binds = [];
  if (slugsParam) {
    const list = slugsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
    if (list.length) { sql += ` AND slug IN (${list.map(() => "?").join(",")})`; binds.push(...list); }
  }
  if (type === "digital" || type === "physical") { sql += ` AND type = ?`; binds.push(type); }
  if (q) {
    sql += ` AND (name LIKE ? OR category LIKE ? OR description LIKE ?)`;
    const like = `%${q}%`;
    binds.push(like, like, like);
  }
  sql += ` ORDER BY created_at DESC LIMIT 100`;

  const stmt = env.DB.prepare(sql);
  const { results } = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return json({ ok: true, products: results.map(publicProduct), shipping: shippingFrom(env) });
}
