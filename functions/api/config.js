// GET /api/config — ธีมสีร้านสำหรับหน้าร้าน (ปรับได้จาก /admin.html)
import { json } from "../lib/http.js";
import { getSettings, publicTheme } from "../lib/settings.js";

export async function onRequestGet({ env }) {
  const settings = await getSettings(env);
  return json({ ok: true, theme: publicTheme(settings) }, 200, { "cache-control": "public, max-age=300" });
}
