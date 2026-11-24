// /admin-api/* — ระบบหลังบ้านครบชุด
import { json, fail, readJson, now, bangkokDate } from "../lib/http.js";
import { verifySession, makeSessionCookie, clearSessionCookie, sha256Hex, timingSafeEqual, randomToken } from "../lib/security.js";
import { getSettings, saveSettings, publicSettings } from "../lib/settings.js";
import { notifyOrderShipped } from "../lib/notify.js";

const IMAGE_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const FILE_MAX_BYTES = 25 * 1024 * 1024;
const STATUSES = ["pending", "paid", "shipped", "expired", "failed"];

export async function onRequest({ request, env, params }) {
  const url = new URL(request.url);
  const raw = params.path;
  const segs = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const method = request.method;
  const head = segs[0] || "";

  if (head === "login" && method === "POST") return login(request, env);

  if (!(await verifySession(request, env))) return fail("unauthorized", "กรุณาเข้าสู่ระบบผู้ดูแล", 401);

  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== url.host) return fail("bad_origin", "ต้นทางคำขอไม่ถูกต้อง", 403);
  }

  if (head === "logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  if (head === "me" && method === "GET") return json({ ok: true });
  if (head === "stats" && method === "GET") return stats(env);

  if (head === "settings") {
    if (method === "GET") {
      const s = await getSettings(env);
      return json({
        ok: true,
        settings: publicSettings(s),
        flags: {
          resend: Boolean(env.RESEND_API_KEY),
          email_from: env.EMAIL_FROM || "",
          public_url: env.PUBLIC_URL || "",
        },
      });
    }
    if (method === "POST") return updateSettings(request, env);
    return fail("method_not_allowed", "ไม่รองรับเมธอดนี้", 405);
  }

  if (head === "line-users" && method === "GET") {
    const { results } = await env.DB.prepare(`SELECT line_user_id, display_name, bound_email, updated_at FROM line_users ORDER BY updated_at DESC LIMIT 100`).all();
    return json({ ok: true, users: results });
  }

  if (head === "coupons") {
    if (segs.length === 1 && method === "GET") return listCoupons(env);
    if (segs.length === 1 && method === "POST") return saveCoupon(request, env, null);
    if (segs.length === 2 && method === "POST") {
      const existing = await env.DB.prepare(`SELECT * FROM coupons WHERE id = ? AND deleted = 0`).bind(segs[1]).first();
      if (!existing) return fail("not_found", "ไม่พบคูปอง", 404);
      return saveCoupon(request, env, existing);
    }
    if (segs.length === 3 && method === "POST" && segs[2] === "delete") return deleteCoupon(env, segs[1]);
    return fail("not_found", "ไม่พบเส้นทาง", 404);
  }

  if (head === "products") {
    if (segs.length === 1 && method === "GET") return listProducts(env);
    if (segs.length === 1 && method === "POST") return saveProduct(request, env, null);
    if (segs.length === 2 && method === "POST") {
      const existing = await findProduct(env, segs[1]);
      if (!existing) return fail("not_found", "ไม่พบสินค้า", 404);
      return saveProduct(request, env, existing);
    }
    if (segs.length === 3 && method === "POST" && segs[2] === "delete") return deleteProduct(env, segs[1]);
    if (segs.length === 3 && method === "POST" && segs[2] === "stock") return adjustStock(request, env, segs[1]);
    return fail("not_found", "ไม่พบเส้นทาง", 404);
  }

  if (head === "orders") {
    if (segs.length === 1 && method === "GET") return listOrders(request, env);
    if (segs.length === 3 && method === "POST" && segs[2] === "ship") return shipOrder(request, env, segs[1]);
    if (segs.length === 3 && method === "POST" && segs[2] === "pickup") return markPickup(env, segs[1]);
    return fail("not_found", "ไม่พบเส้นทาง", 404);
  }

  if (head === "finance") {
    if (segs[1] === "summary" && method === "GET") return financeSummary(request, env);
    if (segs[1] === "transactions" && segs.length === 2 && method === "GET") return listTransactions(request, env);
    if (segs[1] === "transactions" && segs.length === 2 && method === "POST") return createTransaction(request, env);
    if (segs[1] === "transactions" && segs.length === 4 && method === "POST" && segs[3] === "delete") return deleteTransaction(env, segs[2]);
    if (segs[1] === "export.csv" && method === "GET") return exportCsv(request, env);
    return fail("not_found", "ไม่พบเส้นทาง", 404);
  }

  return fail("not_found", "ไม่พบเส้นทาง", 404);
}

/* ════════ เข้าสู่ระบบ ════════ */
async function login(request, env) {
  if (!env.ADMIN_PASSWORD) return fail("not_configured", "ยังไม่ได้ตั้งค่า ADMIN_PASSWORD", 500);
  if (env.ADMIN_PASSWORD.length < 12) return fail("weak_password", "ADMIN_PASSWORD ต้องมีความยาวอย่างน้อย 12 ตัวอักษร", 500);
  const body = await readJson(request);
  const [given, expected] = await Promise.all([sha256Hex(String(body?.password ?? "")), sha256Hex(env.ADMIN_PASSWORD)]);
  if (!timingSafeEqual(given, expected)) {
    await new Promise((r) => setTimeout(r, 500));
    return fail("bad_password", "รหัสผ่านไม่ถูกต้อง", 401);
  }
  return json({ ok: true }, 200, { "set-cookie": await makeSessionCookie(env) });
}

async function stats(env) {
  const row = await env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM products WHERE deleted = 0) AS products,
      (SELECT COUNT(*) FROM products WHERE deleted = 0 AND type = 'physical' AND stock IS NOT NULL AND stock <= 5) AS low_stock,
      (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'paid') AS to_ship,
      (SELECT COUNT(*) FROM orders WHERE status = 'shipped') AS shipped_orders,
      (SELECT COALESCE(SUM(total_thb), 0) FROM orders WHERE status IN ('paid','shipped')) AS revenue_thb`
  ).first();
  return json({ ok: true, stats: row });
}

/* ════════ ตั้งค่าร้าน (ธีมสี / ขนส่ง / อีเมล / LINE) ════════ */
const HEX = /^#[0-9a-fA-F]{6}$/;

async function updateSettings(request, env) {
  const body = await readJson(request);
  const current = await getSettings(env);

  const theme = { ...current.theme };
  if (body?.theme && typeof body.theme === "object") {
    for (const k of ["preset", "bg", "brand", "brandStrong", "accent"]) {
      if (body.theme[k] !== undefined) theme[k] = body.theme[k];
    }
    for (const k of ["bg", "brand", "brandStrong", "accent"]) {
      if (theme[k] && !HEX.test(String(theme[k]))) return fail("bad_color", "รูปแบบสีไม่ถูกต้อง (ต้องเป็น #RRGGBB)");
    }
  }

  const shipping = { ...current.shipping };
  if (body?.shipping && typeof body.shipping === "object") {
    if (body.shipping.provider !== undefined) shipping.provider = String(body.shipping.provider).slice(0, 60);
    if (body.shipping.pickup_enabled !== undefined) shipping.pickup_enabled = Boolean(body.shipping.pickup_enabled);
    if (body.shipping.pickup_note !== undefined) shipping.pickup_note = String(body.shipping.pickup_note).slice(0, 300);
    if (body.shipping.tracking_url !== undefined) {
      const u = String(body.shipping.tracking_url).trim();
      if (u && !/^https:\/\/\S+$/i.test(u)) return fail("bad_url", "ลิงก์ติดตามพัสดุต้องขึ้นต้นด้วย https://");
      shipping.tracking_url = u;
    }
  }

  const email = { ...current.email };
  if (body?.email && typeof body.email === "object") {
    if (body.email.notify_paid !== undefined) email.notify_paid = Boolean(body.email.notify_paid);
    if (body.email.notify_shipped !== undefined) email.notify_shipped = Boolean(body.email.notify_shipped);
  }

  const line = { ...current.line };
  if (body?.line && typeof body.line === "object") {
    if (body.line.group_enabled !== undefined) line.group_enabled = Boolean(body.line.group_enabled);
    if (body.line.individual_enabled !== undefined) line.individual_enabled = Boolean(body.line.individual_enabled);
    if (body.line.group_ids !== undefined) {
      if (!Array.isArray(body.line.group_ids)) return fail("bad_group_ids", "รูปแบบ group id ไม่ถูกต้อง");
      line.group_ids = body.line.group_ids.map((g) => String(g).trim()).filter(Boolean).slice(0, 20);
    }
    if (body.line.channel_access_token !== undefined) line.channel_access_token = String(body.line.channel_access_token).trim();
    if (body.line.channel_secret !== undefined) line.channel_secret = String(body.line.channel_secret).trim();
  }

  const next = { theme, shipping, email, line };
  await saveSettings(env, next);
  return json({ ok: true, settings: publicSettings(next) });
}

/* ════════ สินค้า ════════ */
async function findProduct(env, id) {
  return env.DB.prepare(`SELECT * FROM products WHERE id = ? AND deleted = 0`).bind(id).first();
}

async function listProducts(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, slug, name, type, category, description, price_thb, compare_at, stock, image_key, file_key, access_url, active, created_at
     FROM products WHERE deleted = 0 ORDER BY created_at DESC`
  ).all();
  return json({ ok: true, products: results.map((p) => ({ ...p, image: p.image_key ? `/media/${p.image_key}` : null })) });
}

function slugify(s) {
  const base = String(s || "").toLowerCase().normalize("NFKD")
    .replace(/[^\w\s-]/g, "").trim()
    .replace(/[\s_]+/g, "-").replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 80);
  return base || "item-" + randomToken(3).toLowerCase();
}

async function uniqueSlug(env, base, excludeId) {
  let slug = base;
  for (let i = 0; i < 6; i++) {
    const sql = `SELECT id FROM products WHERE slug = ?1${excludeId ? " AND id != ?2" : ""}`;
    const row = await (excludeId ? env.DB.prepare(sql).bind(slug, excludeId) : env.DB.prepare(sql).bind(slug)).first();
    if (!row) return slug;
    slug = `${base}-${randomToken(3).toLowerCase()}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function saveProduct(request, env, existing) {
  const form = await request.formData();
  const get = (k) => String(form.get(k) ?? "").trim();

  const name = get("name");
  if (name.length < 2 || name.length > 200) return fail("bad_name", "ชื่อสินค้าต้องมี 2–200 ตัวอักษร");
  const type = get("type") === "digital" ? "digital" : "physical";

  const price = Number(get("price"));
  if (!Number.isInteger(price) || price < 1 || price > 10000000) return fail("bad_price", "ราคาต้องเป็นจำนวนเต็ม 1–10,000,000 บาท");
  const compareRaw = get("compare_at");
  const compareAt = compareRaw === "" ? null : Number(compareRaw);
  if (compareAt !== null && (!Number.isInteger(compareAt) || compareAt < 1)) return fail("bad_compare", "ราคาก่อนลดไม่ถูกต้อง");
  if (compareAt !== null && compareAt <= price) return fail("bad_compare", "ราคาก่อนลดต้องมากกว่าราคาปัจจุบัน");

  let stock = null;
  if (type === "physical") {
    const sRaw = get("stock");
    stock = sRaw === "" ? (existing?.stock ?? 0) : Number(sRaw);
    if (!Number.isInteger(stock) || stock < 0) return fail("bad_stock", "สต๊อกต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  }

  let accessUrl = get("access_url") || null;
  if (accessUrl && !/^https:\/\/\S+$/i.test(accessUrl)) return fail("bad_url", "ลิงก์เข้าถึงต้องขึ้นต้นด้วย https://");

  let imageKey = existing?.image_key ?? null;
  const img = form.get("image");
  if (img instanceof File && img.size > 0) {
    if (!IMAGE_EXT[img.type]) return fail("bad_image", "รูปต้องเป็น JPG, PNG หรือ WEBP เท่านั้น");
    if (img.size > IMAGE_MAX_BYTES) return fail("image_too_large", "รูปต้องมีขนาดไม่เกิน 5MB");
    imageKey = `p/${crypto.randomUUID()}.${IMAGE_EXT[img.type]}`;
    await env.MEDIA.put(imageKey, await img.arrayBuffer(), { httpMetadata: { contentType: img.type } });
  }

  let fileKey = existing?.file_key ?? null;
  let fileName = existing?.file_name ?? null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > FILE_MAX_BYTES) return fail("file_too_large", "ไฟล์ดิจิทัลต้องมีขนาดไม่เกิน 25MB");
    fileKey = `f/${crypto.randomUUID()}`;
    fileName = file.name;
    await env.VAULT.put(fileKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
  }

  if (type === "digital" && !fileKey && !accessUrl) {
    return fail("digital_needs_source", "สินค้าดิจิทัลต้องอัปโหลดไฟล์ หรือระบุลิงก์เข้าถึง (https)");
  }
  if (type === "physical") { fileKey = null; fileName = null; accessUrl = null; }

  const slug = await uniqueSlug(env, get("slug") || slugify(name), existing?.id);
  const category = get("category").slice(0, 80);
  const description = get("description").slice(0, 5000);
  const active = get("active") === "1" ? 1 : 0;
  const ts = now();

  if (existing) {
    await env.DB.prepare(
      `UPDATE products SET slug = ?2, name = ?3, type = ?4, category = ?5, description = ?6,
         price_thb = ?7, compare_at = ?8, stock = ?9, image_key = ?10, file_key = ?11,
         file_name = ?12, access_url = ?13, active = ?14, updated_at = ?15
       WHERE id = ?1 AND deleted = 0`
    ).bind(existing.id, slug, name, type, category, description, price, compareAt, stock, imageKey, fileKey, fileName, accessUrl, active, ts).run();
    return json({ ok: true, id: existing.id });
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO products (id, slug, name, type, category, description, price_thb, compare_at, stock,
       image_key, file_key, file_name, access_url, active, deleted, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?15)`
  ).bind(id, slug, name, type, category, description, price, compareAt, stock, imageKey, fileKey, fileName, accessUrl, active, ts).run();
  return json({ ok: true, id });
}

async function deleteProduct(env, id) {
  const res = await env.DB.prepare(
    `UPDATE products SET deleted = 1, active = 0, updated_at = ?2,
       slug = slug || '-del-' || lower(hex(randomblob(3)))
     WHERE id = ?1 AND deleted = 0`
  ).bind(id, now()).run();
  if (!res.meta.changes) return fail("not_found", "ไม่พบสินค้า", 404);
  return json({ ok: true });
}

async function adjustStock(request, env, id) {
  const body = await readJson(request);
  const delta = Number(body?.delta);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) {
    return fail("bad_delta", "ระบุจำนวนที่ต้องการเพิ่ม/ลดเป็นจำนวนเต็ม (ไม่ใช่ 0)");
  }
  const ts = now();
  let res;
  try {
    res = await env.DB.prepare(
      `UPDATE products SET stock = stock + ?2, updated_at = ?3 WHERE id = ?1 AND type = 'physical' AND deleted = 0`
    ).bind(id, delta, ts).run();
  } catch (e) {
    if (/CHECK constraint/i.test(String(e?.message || ""))) return fail("adjust_failed", "ไม่สามารถลดสต๊อกให้ติดลบได้", 409);
    throw e;
  }
  if (!res.meta.changes) return fail("adjust_failed", "ปรับสต๊อกไม่สำเร็จ (อาจไม่ใช่สินค้าแบบมีสต๊อก)", 409);
  await env.DB.prepare(
    `INSERT INTO stock_movements (id, product_id, delta, reason, created_at) VALUES (?1, ?2, ?3, 'manual', ?4)`
  ).bind(crypto.randomUUID(), id, delta, ts).run();
  return json({ ok: true });
}

/* ════════ คูปอง ════════ */
async function listCoupons(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM coupons WHERE deleted = 0 ORDER BY created_at DESC`).all();
  return json({ ok: true, coupons: results });
}

async function saveCoupon(request, env, existing) {
  const body = await readJson(request);
  const code = String(body?.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) return fail("bad_code", "โค้ดต้องเป็น A-Z, 0-9, -, _ ยาว 2–32 ตัวอักษร");
  const kind = body?.kind === "fixed" ? "fixed" : "percent";
  const value = Number(body?.value);
  if (!Number.isInteger(value) || value < 1 || (kind === "percent" && value > 99)) {
    return fail("bad_value", kind === "percent" ? "ส่วนลดร้อยละต้องอยู่ระหว่าง 1–99" : "มูลค่าส่วนลดต้องเป็นจำนวนเต็มตั้งแต่ 1 บาท");
  }
  const minSub = Number(body?.min_subtotal_thb ?? 0);
  if (!Number.isInteger(minSub) || minSub < 0) return fail("bad_min", "ยอดขั้นต่ำไม่ถูกต้อง");
  let maxDisc = body?.max_discount_thb === "" || body?.max_discount_thb == null ? null : Number(body.max_discount_thb);
  if (maxDisc !== null && (!Number.isInteger(maxDisc) || maxDisc < 1)) return fail("bad_max", "ส่วนลดสูงสุดไม่ถูกต้อง");
  if (kind === "fixed") maxDisc = null;
  let usageLimit = body?.usage_limit === "" || body?.usage_limit == null ? null : Number(body.usage_limit);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) return fail("bad_limit", "จำนวนครั้งไม่ถูกต้อง");

  const toTs = (v) => {
    const s = String(v || "").trim();
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
    return new Date(`${s}T00:00:00+07:00`).getTime();
  };
  const startsAt = toTs(body?.starts_at);
  const endsAt = toTs(body?.ends_at);
  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) return fail("bad_dates", "รูปแบบวันที่ไม่ถูกต้อง");

  const dupSql = `SELECT id FROM coupons WHERE code = ?1 AND deleted = 0${existing ? " AND id != ?2" : ""}`;
  const dupRow = await (existing ? env.DB.prepare(dupSql).bind(code, existing.id) : env.DB.prepare(dupSql).bind(code)).first();
  if (dupRow) return fail("dup_code", "มีโค้ดนี้ในระบบแล้ว", 409);

  const active = body?.active ? 1 : 0;
  const ts = now();
  if (existing) {
    await env.DB.prepare(
      `UPDATE coupons SET code = ?2, kind = ?3, value = ?4, min_subtotal_thb = ?5, max_discount_thb = ?6,
         usage_limit = ?7, starts_at = ?8, ends_at = ?9, active = ?10, updated_at = ?11
       WHERE id = ?1 AND deleted = 0`
    ).bind(existing.id, code, kind, value, minSub, maxDisc, usageLimit, startsAt, endsAt, active, ts).run();
    return json({ ok: true, id: existing.id });
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO coupons (id, code, kind, value, min_subtotal_thb, max_discount_thb, usage_limit, used_count,
       starts_at, ends_at, active, deleted, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9, ?10, 0, ?11, ?11)`
  ).bind(id, code, kind, value, minSub, maxDisc, usageLimit, startsAt, endsAt, active, ts).run();
  return json({ ok: true, id });
}

async function deleteCoupon(env, id) {
  const res = await env.DB.prepare(
    `UPDATE coupons SET deleted = 1, active = 0, updated_at = ?2,
       code = code || '-del-' || lower(hex(randomblob(3)))
     WHERE id = ?1 AND deleted = 0`
  ).bind(id, now()).run();
  if (!res.meta.changes) return fail("not_found", "ไม่พบคูปอง", 404);
  return json({ ok: true });
}

/* ════════ คำสั่งซื้อ / จัดส่ง / เข้ารับพัสดุ ════════ */
async function listOrders(request, env) {
  const status = new URL(request.url).searchParams.get("status") || "";
  let sql = `SELECT o.*, (SELECT json_group_array(json_object('name', oi.name_snapshot, 'qty', oi.qty, 'type', oi.type, 'price', oi.price_thb))
              FROM order_items oi WHERE oi.order_id = o.id) AS items
             FROM orders o`;
  const binds = [];
  if (STATUSES.includes(status)) { sql += ` WHERE o.status = ?`; binds.push(status); }
  sql += ` ORDER BY o.created_at DESC LIMIT 100`;
  const stmt = env.DB.prepare(sql);
  const { results } = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return json({ ok: true, orders: results.map((o) => ({ ...o, items: JSON.parse(o.items || "[]") })) });
}

async function markPickup(env, id) {
  const res = await env.DB.prepare(
    `UPDATE orders SET pickup_status = 'requested', pickup_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'paid'`
  ).bind(id, now()).run();
  if (!res.meta.changes) return fail("not_pickable", "ทำรายการไม่สำเร็จ (ต้องเป็นออเดอร์สถานะ “ชำระแล้ว”)", 409);
  return json({ ok: true });
}

async function shipOrder(request, env, id) {
  const body = await readJson(request);
  const tracking = String(body?.tracking ?? "").trim();
  if (tracking.length < 3 || tracking.length > 60) return fail("bad_tracking", "กรุณากรอกเลขพัสดุให้ถูกต้อง");
  const settings = await getSettings(env);
  const provider = String(body?.provider || settings.shipping?.provider || "").slice(0, 60);
  const res = await env.DB.prepare(
    `UPDATE orders SET status = 'shipped', tracking_number = ?2, shipping_provider = ?3, updated_at = ?4
     WHERE id = ?1 AND status = 'paid'`
  ).bind(id, tracking, provider, now()).run();
  if (!res.meta.changes) return fail("not_shippable", "คำสั่งซื้อต้องอยู่ในสถานะ “ชำระเงินแล้ว” เท่านั้น", 409);
  try { await notifyOrderShipped(env, id); } catch { /* ไม่ให้การแจ้งเตือนล้มดึงการจัดส่ง */ }
  return json({ ok: true });
}

/* ════════ การเงิน: รายรับ-รายจ่าย / รายงานภาษี ════════ */
async function financeSummary(request, env) {
  const url = new URL(request.url);
  const today = bangkokDate();
  const year = url.searchParams.get("year") || today.slice(0, 4);
  if (!/^\d{4}$/.test(year)) return fail("bad_year", "รูปแบบปีไม่ถูกต้อง");
  const ym = today.slice(0, 7);

  const sums = async (pattern) => {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_thb END), 0) AS income,
              COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_thb END), 0) AS expense
       FROM transactions WHERE occurred_on LIKE ?1`
    ).bind(pattern).first();
    return { income: row.income, expense: row.expense, profit: row.income - row.expense };
  };

  const [todayS, monthS, yearS] = await Promise.all([sums(today), sums(`${ym}%`), sums(`${year}%`)]);
  const { results: monthly } = await env.DB.prepare(
    `SELECT substr(occurred_on, 1, 7) AS ym,
            COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_thb END), 0) AS income,
            COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_thb END), 0) AS expense
     FROM transactions WHERE occurred_on LIKE ?1 GROUP BY ym ORDER BY ym`
  ).bind(`${year}%`).all();
  const { results: expenseCategories } = await env.DB.prepare(
    `SELECT category, SUM(amount_thb) AS total FROM transactions
     WHERE kind = 'expense' AND occurred_on LIKE ?1 GROUP BY category ORDER BY total DESC`
  ).bind(`${year}%`).all();

  return json({
    ok: true, year,
    today: todayS, month: monthS, yearSummary: yearS,
    monthly, expenseCategories,
  });
}

async function listTransactions(request, env) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "";
  const year = url.searchParams.get("year") || "";
  const month = url.searchParams.get("month") || "";

  let sql = `SELECT t.*, o.number AS order_number FROM transactions t LEFT JOIN orders o ON o.id = t.order_id WHERE 1=1`;
  const binds = [];
  if (kind === "income" || kind === "expense") { sql += ` AND t.kind = ?`; binds.push(kind); }
  if (/^\d{4}$/.test(year)) { sql += ` AND t.occurred_on LIKE ?`; binds.push(`${year}%`); }
  if (/^\d{4}-\d{2}$/.test(month)) { sql += ` AND t.occurred_on LIKE ?`; binds.push(`${month}%`); }
  sql += ` ORDER BY t.occurred_on DESC, t.created_at DESC LIMIT 300`;
  const stmt = env.DB.prepare(sql);
  const { results } = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
  return json({ ok: true, transactions: results });
}

async function createTransaction(request, env) {
  const body = await readJson(request);
  const kind = body?.kind === "income" ? "income" : body?.kind === "expense" ? "expense" : null;
  const amount = Number(body?.amount);
  const date = String(body?.date || "").trim();
  if (!kind) return fail("bad_kind", "กรุณาเลือกประเภทรายการ");
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000000) return fail("bad_amount", "จำนวนเงินไม่ถูกต้อง");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("bad_date", "วันที่ไม่ถูกต้อง");
  const category = String(body?.category || "อื่นๆ").slice(0, 60);
  const note = String(body?.note || "").slice(0, 300);
  await env.DB.prepare(
    `INSERT INTO transactions (id, kind, category, amount_thb, note, occurred_on, order_id, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)`
  ).bind(crypto.randomUUID(), kind, category, amount, note, date, now()).run();
  return json({ ok: true });
}

async function deleteTransaction(env, id) {
  // ลบได้เฉพาะรายการที่กรอกเอง (รายการจากออเดอร์เป็นข้อมูลบัญชี แก้ได้เฉพาะผ่านออเดอร์)
  const res = await env.DB.prepare(`DELETE FROM transactions WHERE id = ? AND order_id IS NULL`).bind(id).run();
  if (!res.meta.changes) return fail("not_deletable", "ลบไม่ได้ — รายการนี้มาจากออเดอร์ (เป็นข้อมูลบัญชี)", 409);
  return json({ ok: true });
}

async function exportCsv(request, env) {
  const year = new URL(request.url).searchParams.get("year") || String(new Date().getFullYear());
  if (!/^\d{4}$/.test(year)) return fail("bad_year", "รูปแบบปีไม่ถูกต้อง");
  const { results } = await env.DB.prepare(
    `SELECT t.*, o.number AS order_number FROM transactions t LEFT JOIN orders o ON o.id = t.order_id
     WHERE t.occurred_on LIKE ?1 ORDER BY t.occurred_on ASC, t.created_at ASC LIMIT 5000`
  ).bind(`${year}%`).all();
  const escCsv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["วันที่", "เลขที่เอกสาร", "ประเภท", "หมวดหมู่", "จำนวนเงิน (บาท)", "หมายเหตุ"];
  const rows = results.map((r) => [r.occurred_on, r.order_number || "", r.kind === "income" ? "รายรับ" : "รายจ่าย", r.category, r.amount_thb, r.note]);
  const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(escCsv).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="transactions-${year}.csv"`,
    },
  });
}
