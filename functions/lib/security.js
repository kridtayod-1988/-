const enc = new TextEncoder();

export const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}
export function timingSafeEqual(a, b) {
  const x = String(a), y = String(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) | 0) ^ (y.charCodeAt(i) | 0);
  return diff === 0;
}
export function randomToken(bytes = 24) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
async function sessionSecret(env) {
  return env.SESSION_SECRET || (await sha256Hex("admin-session::" + env.ADMIN_PASSWORD));
}
export async function makeSessionCookie(env) {
  const exp = String(Date.now() + SESSION_TTL_MS);
  const sig = await hmacHex(await sessionSecret(env), exp);
  return `adm=${exp}.${sig}; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
}
export function clearSessionCookie() {
  return "adm=; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=0";
}
export async function verifySession(request, env) {
  const m = /(?:^|;\s*)adm=([^;]+)/.exec(request.headers.get("cookie") || "");
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!/^\d{13}$/.test(exp || "") || !sig) return false;
  const expected = await hmacHex(await sessionSecret(env), exp);
  if (!timingSafeEqual(sig, expected)) return false;
  return Number(exp) > Date.now();
}
