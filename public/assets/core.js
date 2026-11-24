export async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers: opts.body && !isForm ? { "content-type": "application/json" } : undefined,
    body: opts.body ? (isForm ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `เกิดข้อผิดพลาด (${res.status})`);
    err.status = res.status;
    err.code = data?.error?.code || "";
    throw err;
  }
  return data;
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const thb = (n) => "฿" + Number(n || 0).toLocaleString("th-TH");
export const fmtDate = (ts) => new Date(Number(ts)).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export function imgOr(p, cls = "") {
  if (p?.image) return `<img class="${cls}" src="${esc(p.image)}" alt="${esc(p?.name || "")}" loading="lazy">`;
  return `<div class="${cls} img-fallback" aria-hidden="true"><span>${esc((p?.name || "?").slice(0, 1))}</span></div>`;
}

export function toast(message, isError = false) {
  let holder = document.getElementById("toast-holder");
  if (!holder) { holder = document.createElement("div"); holder.id = "toast-holder"; document.body.appendChild(holder); }
  const t = document.createElement("div");
  t.className = "toast" + (isError ? " err" : "");
  t.textContent = message;
  holder.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 350); }, 3800);
}
