// POST /api/line-webhook — LINE Messaging API webhook
// - follow: ลงทะเบียนผู้ใช้ LINE + แจ้งวิธีผูกคำสั่งซื้อ
// - message (พิมพ์ BP-XXXXXXXX): ผูก LINE กับคำสั่งซื้อ เพื่อรับแจ้งเตือนรายบุคคล
// - joined: บอทถูกชวนเข้ากลุ่ม → บันทึก group id อัตโนมัติ
import { json } from "../lib/http.js";
import { getSettings, saveSettings } from "../lib/settings.js";
import { timingSafeEqual } from "../lib/security.js";
import { pushLineText } from "../lib/notify.js";

const enc = new TextEncoder();

export async function onRequestPost({ request, env }) {
  const bodyText = await request.text();
  const settings = await getSettings(env);
  const secret = settings?.line?.channel_secret;
  if (!secret) return json({ ok: false, error: "not_configured" }, 400);

  const sig = request.headers.get("x-line-signature") || "";
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, enc.encode(bodyText));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  if (!timingSafeEqual(sig, expected)) return json({ ok: false, error: "bad_signature" }, 400);

  let payload;
  try { payload = JSON.parse(bodyText); } catch { return json({ ok: false }, 400); }

  const ts = Date.now();
  for (const ev of payload.events || []) {
    const userId = ev.source?.userId;
    if (ev.type === "follow" && userId) {
      await env.DB.prepare(
        `INSERT INTO line_users (line_user_id, display_name, created_at, updated_at) VALUES (?1, '', ?2, ?2)
         ON CONFLICT(line_user_id) DO UPDATE SET updated_at = ?2`
      ).bind(userId, ts).run();
      await pushLineText(env, userId, "สวัสดีค่ะ 🙏 ร้านเปรมปรี ศรีนาราง\nพิมพ์เลขคำสั่งซื้อ (เช่น BP-XXXXXXXX) เพื่อผูกคำสั่งซื้อ แล้วทางร้านจะแจ้งสถานะผ่าน LINE นี้ค่ะ");
    } else if (ev.type === "joined" && ev.source?.groupId) {
      const ids = Array.isArray(settings.line?.group_ids) ? [...settings.line.group_ids] : [];
      if (!ids.includes(ev.source.groupId)) {
        ids.push(ev.source.groupId);
        await saveSettings(env, { ...settings, line: { ...settings.line, group_ids: ids } });
      }
      await pushLineText(env, ev.source.groupId, "บอทเข้าร่วมกลุ่มเรียบร้อย ✅ เปิดการแจ้งเตือนกลุ่มได้ที่หน้าตั้งค่า → LINE OA");
    } else if (ev.type === "message" && ev.message?.type === "text" && userId) {
      const m = String(ev.message.text || "").toUpperCase().match(/BP-[0-9A-Z]{8}/);
      if (!m) continue;
      const order = await env.DB.prepare(`SELECT number, email FROM orders WHERE number = ?`).bind(m[0]).first();
      if (order) {
        await env.DB.prepare(
          `INSERT INTO line_users (line_user_id, display_name, bound_email, created_at, updated_at) VALUES (?1, '', ?2, ?3, ?3)
           ON CONFLICT(line_user_id) DO UPDATE SET bound_email = ?2, updated_at = ?3`
        ).bind(userId, order.email, ts).run();
        await pushLineText(env, userId, `ผูกคำสั่งซื้อ ${order.number} เรียบร้อยแล้วค่ะ ✅ ทางร้านจะแจ้งสถานะการจัดส่งที่ LINE นี้`);
      } else {
        await pushLineText(env, userId, "ไม่พบเลขคำสั่งซื้อนี้ค่ะ กรุณาตรวจสอบอีกครั้ง (ตัวอย่าง: BP-XXXXXXXX)");
      }
    }
  }
  return json({ ok: true });
}
