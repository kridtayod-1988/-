export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
export function fail(code, message, status = 400) {
  return json({ ok: false, error: { code, message } }, status);
}
export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}
export const now = () => Date.now();
export function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
export function bangkokDate(ts = Date.now()) {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}
