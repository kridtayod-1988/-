export async function onRequestGet({ params, env }) {
  const plain = (msg, status) => new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
  const row = await env.DB.prepare(
    `SELECT dt.expires_at, dt.max_uses, dt.use_count, p.file_key, p.file_name, o.status AS order_status
     FROM download_tokens dt
     JOIN order_items oi ON oi.id = dt.order_item_id
     JOIN products p ON p.id = oi.product_id
     JOIN orders o ON o.id = oi.order_id
     WHERE dt.token = ?`
  ).bind(params.token).first();
  if (!row) return plain("ลิงก์ดาวน์โหลดไม่ถูกต้อง", 404);
  if (row.order_status !== "paid" && row.order_status !== "shipped") return plain("คำสั่งซื้อนี้ยังไม่ได้ชำระเงิน", 403);
  if (row.expires_at < Date.now()) return plain("ลิงก์ดาวน์โหลดหมดอายุแล้ว กรุณาติดต่อร้าน", 410);
  const up = await env.DB.prepare(
    `UPDATE download_tokens SET use_count = use_count + 1 WHERE token = ? AND use_count < max_uses`
  ).bind(params.token).run();
  if (!up.meta.changes) return plain("ใช้ลิงก์ครบจำนวนครั้งที่กำหนดแล้ว", 429);
  const obj = await env.VAULT.get(row.file_key);
  if (!obj) return plain("ไม่พบไฟล์ กรุณาติดต่อร้าน", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  const fname = row.file_name || "download";
  const ascii = fname.replace(/[^\x20-\x7e]/g, "_");
  headers.set("content-disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fname)}`);
  return new Response(obj.body, { headers });
}
