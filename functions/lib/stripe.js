import { timingSafeEqual, toHex } from "./security.js";

const enc = new TextEncoder();
const API = "https://api.stripe.com/v1";

function encodeForm(value, prefix = "") {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => encodeForm(v, prefix ? `${prefix}[${k}]` : k));
  }
  return [`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`];
}

export async function stripeRequest(env, method, path, params) {
  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" || method === "DELETE" ? undefined : encodeForm(params || {}).join("&"),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe API error (${res.status})`);
    err.stripeCode = data?.error?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = {};
  for (const pair of header.split(",")) {
    const i = pair.indexOf("=");
    if (i > 0) parts[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  const ts = parts.t;
  const sigs = (parts.v1 || "").split(",").filter(Boolean);
  if (!ts || !sigs.length) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = toHex(await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${payload}`)));
  if (!sigs.some((s) => timingSafeEqual(s, mac))) return false;
  return Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
}
