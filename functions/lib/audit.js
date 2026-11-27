// บันทึกการดำเนินการทุกขั้นตอน (audit trail) — ดูได้ที่ /admin.html → ตั้งค่า
import { clientIp } from "./security.js";

export async function logAudit(env, request, action, detail = "") {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, action, detail, ip, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(crypto.randomUUID(), action, String(detail).slice(0, 500), clientIp(request), Date.now()).run();
  } catch {
    // ไม่ให้การบันทึก audit ทำให้คำขอหลักล้ม
  }
}
