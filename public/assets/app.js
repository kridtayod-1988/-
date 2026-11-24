// หน้าร้าน SPA — home/product/cart/checkout/order/legal + ธีมสีไดนามิก + คูปอง
import { SHOP } from "./config.js";
import { api, esc, thb, fmtDate, imgOr, toast } from "./core.js";

const $ = (sel, el = document) => el.querySelector(sel);
const app = document.getElementById("app");
let routeSeq = 0;

/* ── ตะกร้า (localStorage) ── */
const CART_KEY = "cart.v1";
let cart = loadCart();
let catalog = null;
let currentProduct = null;

function loadCart() {
  try {
    const arr = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.slug === "string" && Number.isInteger(x.qty) && x.qty > 0) : [];
  } catch { return []; }
}
function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateBadge(); }
function updateBadge() {
  const el = document.getElementById("cart-count");
  if (el) el.textContent = String(cart.reduce((n, x) => n + x.qty, 0));
}
function findProduct(slug) {
  if (currentProduct?.slug === slug) return currentProduct;
  return catalog?.products.find((p) => p.slug === slug) || null;
}
function maxQty(p) { return p?.type === "physical" ? (p?.stock ?? 0) : 1; }
function addToCart(slug, qty, p) {
  const item = cart.find((x) => x.slug === slug);
  const cur = item ? item.qty : 0;
  const max = maxQty(p);
  const next = Math.min(cur + qty, max);
  if (next === cur) return false;
  if (item) item.qty = next; else cart.push({ slug, qty: next });
  saveCart();
  return true;
}

async function fetchCatalog(force = false) {
  if (!force && catalog && Date.now() - (catalog.ts || 0) < 60000) return catalog;
  const data = await api("/api/products");
  catalog = { products: data.products, shipping: data.shipping, ts: Date.now() };
  return catalog;
}

/* ── Router ── */
const routes = [
  { re: /^\/$/, view: homeView },
  { re: /^\/product\/([A-Za-z0-9-]+)$/, view: productView },
  { re: /^\/cart$/, view: cartView },
  { re: /^\/checkout$/, view: checkoutView },
  { re: /^\/order$/, view: () => renderLookupForm("") },
  { re: /^\/order\/([A-Za-z0-9_-]+)$/, view: orderView },
  { re: /^\/terms$/, view: () => legalView("terms") },
  { re: /^\/privacy$/, view: () => legalView("privacy") },
];

async function render() {
  const seq = ++routeSeq;
  const path = location.pathname;
  const url = new URL(location.href);
  const route = routes.find((r) => r.re.test(path));
  app.innerHTML = `<div class="container pad-lg"><p class="muted">กำลังโหลด…</p></div>`;
  try {
    if (!route) throw Object.assign(new Error("ไม่พบหน้าที่ต้องการ"), { status: 404 });
    const m = path.match(route.re).slice(1);
    await route.view(m, url, seq);
  } catch (e) {
    if (seq === routeSeq) app.innerHTML = errorBlock(e);
  }
  window.scrollTo(0, 0);
}
function navigate(to) { history.pushState({}, "", to); render(); }

document.addEventListener("click", (e) => {
  const link = e.target.closest("a[data-link]");
  if (link) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(link.getAttribute("href"));
    return;
  }
  const el = e.target.closest("[data-action]");
  if (el) handleAction(el, e);
});
addEventListener("popstate", render);

async function handleAction(el, e) {
  const act = el.dataset.action;
  if (act === "add" || act === "buy") {
    e.preventDefault();
    const slug = el.dataset.slug;
    const qtyEl = el.dataset.qtyTarget ? $(el.dataset.qtyTarget) : null;
    const qty = qtyEl ? Math.max(1, Math.min(10, Number(qtyEl.value) || 1)) : 1;
    const p = findProduct(slug);
    if (!p) return;
    const max = maxQty(p);
    const already = cart.find((x) => x.slug === slug)?.qty || 0;
    if (already >= max) {
      toast(p.type === "physical" ? `มีสินค้าเหลือเพียง ${max} ชิ้นในสต๊อก` : "สินค้าดิจิทัลซื้อได้ครั้งละ 1 ชิ้น", true);
      if (act === "buy") navigate("/checkout");
      return;
    }
    const added = addToCart(slug, Math.min(qty, max - already), p);
    if (added) toast(`เพิ่ม “${p.name}” ลงตะกร้าแล้ว`);
    if (act === "buy") navigate("/checkout");
    return;
  }
  if (act === "pqty-dec" || act === "pqty-inc") {
    e.preventDefault();
    const input = $("#qty-main");
    if (!input) return;
    const cap = Math.min(10, maxQty(currentProduct) || 1);
    let v = Number(input.value) || 1;
    v = act === "pqty-inc" ? Math.min(cap, v + 1) : Math.max(1, v - 1);
    input.value = String(v);
    return;
  }
  if (act === "qty-inc" || act === "qty-dec") {
    e.preventDefault();
    const slug = el.dataset.slug;
    const item = cart.find((x) => x.slug === slug);
    if (!item) return;
    if (act === "qty-inc") {
      const p = findProduct(slug);
      const max = maxQty(p);
      if (item.qty >= max) { toast(p?.type === "physical" ? `มีสินค้าเหลือเพียง ${max} ชิ้น` : "สินค้าดิจิทัลซื้อได้ครั้งละ 1 ชิ้น", true); return; }
      item.qty += 1;
    } else {
      item.qty -= 1;
    }
    if (item.qty <= 0) cart = cart.filter((x) => x.slug !== slug);
    saveCart();
    render();
    return;
  }
  if (act === "cart-remove") {
    e.preventDefault();
    cart = cart.filter((x) => x.slug !== el.dataset.slug);
    saveCart();
    render();
    return;
  }
  if (act === "copy-number") {
    e.preventDefault();
    navigator.clipboard?.writeText(el.dataset.copy || "").then(() => toast("คัดลอกเลขคำสั่งซื้อแล้ว")).catch(() => {});
    return;
  }
}

/* ── หน้าแรก ── */
async function homeView(_m, url, seq) {
  document.title = `${SHOP.name} — ${SHOP.tagline}`;
  const q = (url.searchParams.get("q") || "").trim();
  const filter = (url.searchParams.get("type") || "").trim();
  const data = await fetchCatalog(true);
  if (seq !== routeSeq) return;
  let products = data.products;
  if (filter === "digital") products = products.filter((p) => p.type === "digital");
  else if (filter) products = products.filter((p) => p.category === filter);
  if (q) {
    const needle = q.toLowerCase();
    products = products.filter((p) => [p.name, p.category, p.description].some((s) => (s || "").toLowerCase().includes(needle)));
  }
  app.innerHTML = `
    ${heroHtml()}
    <section class="container">
      <div class="toolbar">
        <div class="chips" id="chips">
          ${chipHtml("ทั้งหมด", "", !filter)}
          ${["เสื้อยืด", "เสื้อเชิ้ต", "กางเกง", "กระโปรง", "เดรส"].map((c) => chipHtml(c, c, filter === c)).join("")}
          ${chipHtml("ดิจิทัล", "digital", filter === "digital")}
        </div>
        <form id="search-form" class="search">
          <input type="search" name="q" placeholder="ค้นหาสินค้า เช่น เสื้อยืด…" value="${esc(q)}">
          <button class="btn ghost sm" type="submit">ค้นหา</button>
        </form>
      </div>
      <div class="grid" id="grid">${products.map(cardHtml).join("") || emptyState("ไม่พบสินค้าที่ตรงกับเงื่อนไข — ลองคำอื่นหรือเลือกหมวดหมู่ทั้งหมด")}</div>
    </section>`;
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    const f = b.dataset.filter;
    const qs = q ? `q=${encodeURIComponent(q)}&` : "";
    navigate(f ? `/?${qs}type=${encodeURIComponent(f)}` : (q ? `/?${qs}` : "/"));
  });
  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = new FormData(e.target).get("q").trim();
    navigate(v ? `/?q=${encodeURIComponent(v)}` : "/");
  });
}

function heroHtml() {
  const H = SHOP.hero;
  return `
  <section class="hero">
    <div class="hero-inner">
      <p class="kicker">${esc(H.kicker)}</p>
      <h1>${esc(H.title)}</h1>
      <p class="sub">${esc(H.sub)}</p>
      <div class="hero-cta">
        <a class="btn primary" href="#grid">${esc(H.ctaPrimary)}</a>
        <a class="btn outline" data-link href="/order">${esc(H.ctaSecondary)}</a>
      </div>
      <ul class="trust">${SHOP.trust.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    </div>
  </section>`;
}
function chipHtml(label, filter, active) {
  return `<button type="button" class="chip${active ? " active" : ""}" data-filter="${esc(filter)}">${esc(label)}</button>`;
}
function badgeHtml(p) {
  if (p.type === "digital") return `<span class="badge digital">ดิจิทัล</span>`;
  if ((p.stock ?? 0) === 0) return `<span class="badge warn">หมดชั่วคราว</span>`;
  return `<span class="badge">พร้อมส่ง</span>`;
}
function cardHtml(p) {
  const disabled = !p.purchasable;
  const cta = disabled
    ? `<button class="btn ghost block" disabled>${p.type === "digital" ? "เร็ว ๆ นี้" : "สินค้าหมด"}</button>`
    : `<button class="btn primary block" data-action="add" data-slug="${esc(p.slug)}">เพิ่มลงตะกร้า</button>`;
  return `
  <article class="card product-card">
    <a class="card-media" data-link href="/product/${esc(p.slug)}">
      ${imgOr(p)}
      <span class="badge-wrap">${badgeHtml(p)}</span>
    </a>
    <div class="card-body">
      <p class="card-cat muted">${esc(p.category || (p.type === "digital" ? "สินค้าดิจิทัล" : ""))}</p>
      <h3 class="card-title"><a data-link href="/product/${esc(p.slug)}">${esc(p.name)}</a></h3>
      <p class="price-line">${p.compare_at ? `<s class="muted">${thb(p.compare_at)}</s>` : ""}<strong>${thb(p.price)}</strong></p>
      ${cta}
    </div>
  </article>`;
}
function emptyState(msg) {
  return `<div class="empty card"><p>${esc(msg)}</p><a data-link class="btn outline sm" href="/">ดูสินค้าทั้งหมด</a></div>`;
}
function emptyCartHtml() {
  return `<section class="container pad-lg center">
    <h1>ตะกร้ายังว่างเปล่า</h1>
    <p class="muted">เลือกซื้อเสื้อผ้าที่ชอบ แล้วกลับมาที่นี่ได้เลย</p>
    <a data-link class="btn primary" href="/">เริ่มช้อปปิ้ง</a>
  </section>`;
}
function errorBlock(e) {
  return `<section class="container pad-xl center">
    <h1>${e?.status === 404 ? "ไม่พบหน้านี้" : "เกิดข้อผิดพลาด"}</h1>
    <p class="muted">${esc(e?.message || "ลองใหม่อีกครั้ง")}</p>
    <a data-link class="btn primary" href="/">กลับหน้าร้าน</a>
  </section>`;
}

/* ── หน้าสินค้า ── */
async function productView([slug], _url, seq) {
  const data = await api(`/api/products/${encodeURIComponent(slug)}`);
  if (seq !== routeSeq) return;
  const p = data.product;
  const shipping = data.shipping;
  currentProduct = p;
  document.title = `${p.name} — ${SHOP.name}`;
  const isDigital = p.type === "digital";
  const stock = p.stock ?? 0;
  const purchasable = p.purchasable;
  const assure = isDigital
    ? ["ชำระเงินแล้วดาวน์โหลดได้ทันทีจากหน้าคำสั่งซื้อ", "ลิงก์ดาวน์โหลดมีอายุ 30 วัน ใช้ได้สูงสุด 20 ครั้ง", "รองรับลิงก์เข้าถึงสำหรับสินค้าประเภทเนื้อหา/คอร์ส"]
    : ["จัดส่ง 1–3 วันทำการ พร้อมเลขพัสดุสำหรับติดตาม", shipping?.fee > 0 ? `ส่งฟรีเมื่อยอดสั่งซื้อถึง ${thb(shipping.free_from)}` : "ส่งฟรีทุกออเดอร์", "เปลี่ยนไซซ์ได้ภายใน 7 วัน"];
  app.innerHTML = `
  <div class="container">
    <nav class="crumbs"><a data-link href="/">หน้าแรก</a><span>›</span><span>${esc(p.name)}</span></nav>
    <div class="product-layout">
      <div class="product-media">${imgOr(p, "product-img")}</div>
      <div class="product-info">
        <span class="badge-wrap">${badgeHtml(p)}</span>
        <p class="card-cat muted">${esc(p.category || "")}</p>
        <h1>${esc(p.name)}</h1>
        <p class="price-line lg">${p.compare_at ? `<s class="muted">${thb(p.compare_at)}</s>` : ""}<strong>${thb(p.price)}</strong></p>
        <p class="stock-note ${!isDigital && stock > 0 && stock <= 5 ? "warn" : ""}">
          ${isDigital
            ? (purchasable ? "ไฟล์พร้อมให้ดาวน์โหลดหลังชำระเงิน" : "อยู่ระหว่างเตรียมไฟล์ — พร้อมขายเร็ว ๆ นี้")
            : (stock === 0 ? "สินค้าหมดชั่วคราว" : stock <= 5 ? `เหลือเพียง ${stock} ชิ้นในสต๊อก` : "พร้อมส่ง")}
        </p>
        <p class="desc">${esc(p.description || "")}</p>
        ${!isDigital && purchasable ? `
        <div class="qty-stepper" aria-label="จำนวนสินค้า">
          <button type="button" class="btn ghost sm" data-action="pqty-dec" aria-label="ลดจำนวน">−</button>
          <input id="qty-main" class="qty-input" value="1" inputmode="numeric" readonly aria-label="จำนวน">
          <button type="button" class="btn ghost sm" data-action="pqty-inc" aria-label="เพิ่มจำนวน">+</button>
        </div>` : ""}
        <div class="actions">
          <button class="btn primary lg" data-action="add" data-slug="${esc(p.slug)}" data-qty-target="#qty-main" ${purchasable ? "" : "disabled"}>${purchasable ? "เพิ่มลงตะกร้า" : "ยังไม่พร้อมขาย"}</button>
          <button class="btn outline lg" data-action="buy" data-slug="${esc(p.slug)}" data-qty-target="#qty-main" ${purchasable ? "" : "disabled"}>ซื้อเลย</button>
        </div>
        <ul class="assure">${assure.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>
    </div>
  </div>`;
}

/* ── ตะกร้า ── */
async function cartView(_m, url, seq) {
  document.title = `ตะกร้าสินค้า — ${SHOP.name}`;
  const cancelToken = url.searchParams.get("cancel");
  if (cancelToken) {
    history.replaceState({}, "", "/cart");
    try {
      await api("/api/order/cancel", { body: { token: cancelToken } });
      toast("ยกเลิกคำสั่งซื้อแล้ว — สินค้าจะถูกคืนสต๊อกให้อัตโนมัติ");
    } catch { /* เงียบไป */ }
  }
  if (!cart.length) { app.innerHTML = emptyCartHtml(); return; }
  const slugs = cart.map((x) => x.slug).join(",");
  const data = await api(`/api/products?slugs=${encodeURIComponent(slugs)}`);
  if (seq !== routeSeq) return;
  const bySlug = new Map(data.products.map((p) => [p.slug, p]));
  let changed = false;
  cart = cart.filter((x) => {
    const p = bySlug.get(x.slug);
    if (!p) { changed = true; return false; }
    const max = maxQty(p);
    if (x.qty > max) { x.qty = max; changed = true; }
    return x.qty > 0;
  });
  if (changed) saveCart();
  if (!cart.length) { app.innerHTML = emptyCartHtml(); return; }

  const lines = cart.map((x) => ({ ...x, p: bySlug.get(x.slug) }));
  const subtotal = lines.reduce((n, l) => n + l.p.price * l.qty, 0);
  const sh = data.shipping;
  const hasPhysical = lines.some((l) => l.p.type === "physical");
  const shipping = hasPhysical ? (subtotal >= sh.free_from ? 0 : sh.fee) : 0;
  const shipNote = !hasPhysical
    ? "ออเดอร์นี้เป็นสินค้าดิจิทัลทั้งหมด ไม่มีค่าจัดส่ง"
    : (shipping === 0 ? `ส่งฟรี (ยอดถึง ${thb(sh.free_from)})` : `ส่งฟรีเมื่อยอดถึง ${thb(sh.free_from)}`);

  app.innerHTML = `
  <div class="container">
    <h1>ตะกร้าสินค้า</h1>
    <div class="cart-grid">
      <div class="cart-lines">
        ${lines.map(lineHtml).join("")}
        <a data-link class="btn ghost sm" href="/">← เลือกซื้อสินค้าต่อ</a>
      </div>
      <aside class="summary card pad">
        <h2>สรุปยอด</h2>
        <dl class="totals">
          <div><dt>ยอดสินค้า</dt><dd>${thb(subtotal)}</dd></div>
          <div><dt>ค่าจัดส่ง</dt><dd>${shipping ? thb(shipping) : "ฟรี"}</dd></div>
          <div class="grand"><dt>รวมทั้งสิ้น</dt><dd>${thb(subtotal + shipping)}</dd></div>
        </dl>
        <p class="muted sm">${esc(shipNote)}</p>
        <a data-link class="btn primary block" href="/checkout">ไปที่การชำระเงิน</a>
      </aside>
    </div>
  </div>`;
}

function lineHtml(l) {
  const p = l.p;
  const digital = p.type === "digital";
  return `
  <div class="cart-line card">
    <a class="line-media" data-link href="/product/${esc(p.slug)}">${imgOr(p, "thumb")}</a>
    <div class="line-info">
      <a data-link class="line-name" href="/product/${esc(p.slug)}">${esc(p.name)}</a>
      <p class="muted sm">${digital ? "สินค้าดิจิทัล — ส่งลิงก์ดาวน์โหลดหลังชำระเงิน" : "สินค้าจัดส่ง"}</p>
      ${digital ? `<p class="qty-fixed">จำนวน 1 ชิ้น</p>` : `
      <div class="qty-stepper">
        <button type="button" class="btn ghost sm" data-action="qty-dec" data-slug="${esc(p.slug)}" aria-label="ลดจำนวน">−</button>
        <span class="qty-value">${l.qty}</span>
        <button type="button" class="btn ghost sm" data-action="qty-inc" data-slug="${esc(p.slug)}" aria-label="เพิ่มจำนวน">+</button>
      </div>`}
    </div>
    <div class="line-total">
      <strong>${thb(p.price * l.qty)}</strong>
      <button type="button" class="link-btn" data-action="cart-remove" data-slug="${esc(p.slug)}">เอาออก</button>
    </div>
  </div>`;
}

/* ── ชำระเงิน (รองรับคูปอง) ── */
async function checkoutView(_m, _url, seq) {
  document.title = `ชำระเงิน — ${SHOP.name}`;
  const data = await fetchCatalog();
  if (seq !== routeSeq) return;
  const bySlug = new Map(data.products.map((p) => [p.slug, p]));
  cart = cart.filter((x) => bySlug.has(x.slug));
  if (!cart.length) { app.innerHTML = emptyCartHtml(); return; }
  const lines = cart.map((x) => ({ ...x, p: bySlug.get(x.slug) }));
  const subtotal = lines.reduce((n, l) => n + l.p.price * l.qty, 0);
  const sh = data.shipping;
  const hasPhysical = lines.some((l) => l.p.type === "physical");
  const shipping = hasPhysical ? (subtotal >= sh.free_from ? 0 : sh.fee) : 0;
  const total = subtotal + shipping;

  app.innerHTML = `
  <div class="container">
    <h1>ชำระเงิน</h1>
    <div class="checkout-grid">
      <form id="checkout-form" class="card pad">
        <h2>ข้อมูลผู้สั่งซื้อ</h2>
        <label class="field"><span>ชื่อ-นามสกุล *</span><input name="name" required minlength="2" maxlength="120" autocomplete="name"></label>
        <label class="field"><span>อีเมล * (ใช้ติดตามคำสั่งซื้อ)</span><input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label>
        <label class="field"><span>เบอร์โทรศัพท์${hasPhysical ? " *" : ""}</span><input name="phone" type="tel" ${hasPhysical ? "required" : ""} placeholder="0812345678" inputmode="tel"></label>
        ${hasPhysical ? `
        <h2>ที่อยู่จัดส่ง</h2>
        <label class="field"><span>บ้านเลขที่ / หมู่ / ถนน *</span><input name="address" required minlength="5" maxlength="300" autocomplete="street-address"></label>
        <div class="field-row">
          <label class="field"><span>ตำบล / แขวง *</span><input name="subdistrict" required></label>
          <label class="field"><span>อำเภอ / เขต *</span><input name="district" required></label>
        </div>
        <div class="field-row">
          <label class="field"><span>จังหวัด *</span><input name="province" required></label>
          <label class="field"><span>รหัสไปรษณีย์ *</span><input name="postcode" required inputmode="numeric" maxlength="5" pattern="\\d{5}"></label>
        </div>` : `<p class="note">ออเดอร์นี้เป็นสินค้าดิจิทัลทั้งหมด — ไม่ต้องกรอกที่อยู่ ลิงก์ดาวน์โหลดจะปรากฏในหน้าคำสั่งซื้อทันทีที่ชำระเงินสำเร็จ</p>`}
        <h2>โค้ดส่วนลด</h2>
        <div class="coupon-box">
          <input id="coupon-input" placeholder="โค้ดส่วนลด (ถ้ามี)" autocomplete="off">
          <button type="button" class="btn outline sm" id="coupon-btn">ใช้โค้ด</button>
          <span id="coupon-msg" class="sm muted"></span>
        </div>
        <h2>วิธีชำระเงิน</h2>
        <div class="pay-opts">
          <label class="pay-opt">
            <input type="radio" name="payment_method" value="promptpay" checked>
            <span><strong>พร้อมเพย์ (PromptPay)</strong><span class="muted sm">สแกน QR ในหน้าถัดไป ระบบยืนยันอัตโนมัติ</span></span>
          </label>
          <label class="pay-opt">
            <input type="radio" name="payment_method" value="card">
            <span><strong>บัตรเครดิต / เดบิต</strong><span class="muted sm">ปลอดภัยผ่านหน้าชำระเงินของ Stripe</span></span>
          </label>
        </div>
        <label class="check">
          <input type="checkbox" name="consent" required>
          <span>ข้าพเจ้ายอมรับ<a href="/terms" target="_blank" rel="noopener">เงื่อนไขการใช้บริการ</a>และ<a href="/privacy" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว (PDPA)</a>และยินยอมให้เก็บข้อมูลเพื่อจัดส่งสินค้า</span>
        </label>
        <button class="btn primary lg block" id="pay-btn" type="submit">ดำเนินการชำระเงิน · ${thb(total)}</button>
        <p class="muted sm center">ระบบจะตรวจสอบราคา สต๊อก และโค้ดส่วนลดอีกครั้งก่อนเปิดหน้าชำระเงินอย่างปลอดภัย</p>
      </form>
      <aside class="card pad checkout-summary">
        <h2>สรุปคำสั่งซื้อ</h2>
        <ul class="mini-lines">
          ${lines.map((l) => `<li><span>${esc(l.p.name)} × ${l.qty}</span><span>${thb(l.p.price * l.qty)}</span></li>`).join("")}
          ${shipping ? `<li><span>ค่าจัดส่ง</span><span>${thb(shipping)}</span></li>` : ""}
        </ul>
        <dl class="totals">
          <div><dt>ยอดสินค้า</dt><dd id="sum-subtotal">${thb(subtotal)}</dd></div>
          <div><dt>ค่าจัดส่ง</dt><dd id="sum-shipping">${shipping ? thb(shipping) : "ฟรี"}</dd></div>
          <div class="hidden" id="sum-discount-row"><dt>ส่วนลด <span id="sum-coupon-label"></span></dt><dd id="sum-discount"></dd></div>
          <div class="grand"><dt>ยอดรวม</dt><dd id="sum-total">${thb(total)}</dd></div>
        </dl>
        ${hasPhysical ? (shipping === 0 ? `<p class="muted sm">ยอดถึงเกณฑ์ส่งฟรีแล้ว</p>` : `<p class="muted sm">เพิ่มยอดอีก ${thb(sh.free_from - subtotal)} เพื่อรับส่งฟรี</p>`) : ""}
      </aside>
    </div>
  </div>`;

  let appliedCoupon = null; // { code, discount }
  const updateTotals = (discount, code) => {
    const t = subtotal - discount + shipping;
    $("#sum-discount-row").classList.toggle("hidden", !discount);
    if (discount) {
      $("#sum-coupon-label").textContent = code ? `(${code})` : "";
      $("#sum-discount").textContent = "-" + thb(discount);
    }
    $("#sum-total").textContent = thb(t);
    $("#pay-btn").textContent = `ดำเนินการชำระเงิน · ${thb(t)}`;
  };

  $("#coupon-btn").addEventListener("click", async () => {
    const code = String($("#coupon-input").value || "").trim().toUpperCase();
    const msg = $("#coupon-msg");
    if (!code) { msg.textContent = "กรุณาพิมพ์โค้ดก่อนกดใช้"; return; }
    msg.textContent = "กำลังตรวจสอบโค้ด…";
    try {
      const r = await api(`/api/coupon?code=${encodeURIComponent(code)}&subtotal=${subtotal}`);
      appliedCoupon = { code, discount: r.discount_thb };
      updateTotals(appliedCoupon.discount, code);
      msg.textContent = `ใช้โค้ด ${code} สำเร็จ — ลด ${thb(r.discount_thb)}`;
      msg.classList.remove("muted");
      msg.classList.add("ok-text");
    } catch (err) {
      appliedCoupon = null;
      updateTotals(0, "");
      msg.textContent = err.message;
      msg.classList.add("muted");
      msg.classList.remove("ok-text");
    }
  });

  $("#checkout-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = $("#pay-btn");
    const body = {
      items: cart.map((x) => ({ slug: x.slug, qty: x.qty })),
      name: String(fd.get("name") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      payment_method: fd.get("payment_method") || "promptpay",
      coupon_code: appliedCoupon?.code || "",
      consent: fd.get("consent") === "on",
    };
    if (hasPhysical) {
      body.address = String(fd.get("address") || "").trim();
      body.subdistrict = String(fd.get("subdistrict") || "").trim();
      body.district = String(fd.get("district") || "").trim();
      body.province = String(fd.get("province") || "").trim();
      body.postcode = String(fd.get("postcode") || "").trim();
    }
    btn.disabled = true;
    btn.textContent = "กำลังเปิดหน้าชำระเงิน…";
    try {
      const res = await api("/api/checkout", { body });
      cart = [];
      localStorage.removeItem(CART_KEY);
      updateBadge();
      location.href = res.url;
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = `ดำเนินการชำระเงิน · ${thb(subtotal - (appliedCoupon?.discount || 0) + shipping)}`;
    }
  });
}

/* ── คำสั่งซื้อ / ติดตาม ── */
async function orderView([token], _url, seq) {
  if (token.startsWith("cs_")) { await pollOrder(token, seq); return; }
  const savedEmail = localStorage.getItem("lookup.email") || "";
  if (savedEmail) {
    try {
      const data = await api("/api/order", { body: { number: token, email: savedEmail } });
      if (seq === routeSeq) { document.title = `คำสั่งซื้อ ${data.order.number}`; app.innerHTML = orderBoxHtml(data.order); }
      return;
    } catch { /* แสดงฟอร์มค้นหา */ }
  }
  renderLookupForm(token);
}

function renderLookupForm(prefill = "") {
  document.title = "ติดตามคำสั่งซื้อ";
  app.innerHTML = `
  <section class="container order-lookup">
    <h1>ติดตามคำสั่งซื้อ</h1>
    <form id="lookup-form" class="card pad lookup-form">
      <label class="field"><span>เลขคำสั่งซื้อ</span><input name="number" required value="${esc(prefill)}" placeholder="เช่น BP-XXXXXXXX"></label>
      <label class="field"><span>อีเมลที่ใช้สั่งซื้อ</span><input name="email" type="email" required placeholder="you@example.com"></label>
      <button class="btn primary block">ตรวจสอบสถานะ</button>
    </form>
    <p class="muted sm">หลังชำระเงินสำเร็จ ระบบจะนำคุณมาที่หน้าคำสั่งซื้อโดยอัตโนมัติ และสามารถกลับมาตรวจสอบได้ทุกเมื่อด้วยเลขคำสั่งซื้อ + อีเมล</p>
  </section>`;
  $("#lookup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const number = String(fd.get("number") || "").trim().toUpperCase();
    const email = String(fd.get("email") || "").trim().toLowerCase();
    try {
      const data = await api("/api/order", { body: { number, email } });
      localStorage.setItem("lookup.email", email);
      history.replaceState({}, "", `/order/${number}`);
      document.title = `คำสั่งซื้อ ${data.order.number}`;
      app.innerHTML = orderBoxHtml(data.order);
    } catch (err) { toast(err.message, true); }
  });
}

const STATUS_META = {
  pending: { label: "รอการชำระเงิน", cls: "pending" },
  paid: { label: "ชำระเงินแล้ว — รอจัดส่ง", cls: "paid" },
  shipped: { label: "จัดส่งแล้ว", cls: "shipped" },
  expired: { label: "หมดเวลาชำระเงิน", cls: "expired" },
  failed: { label: "ชำระเงินไม่สำเร็จ", cls: "failed" },
};

async function pollOrder(session, seq) {
  document.title = "ตรวจสอบการชำระเงิน — " + SHOP.name;
  app.innerHTML = `<section class="container pad-lg center">
    <div class="spinner" aria-hidden="true"></div>
    <h1>กำลังตรวจสอบการชำระเงิน</h1>
    <p class="muted" id="poll-note">หากยังเปิดหน้าชำระเงิน (QR พร้อมเพย์/บัตร) อยู่ ให้ชำระให้เสร็จ — หน้านี้จะอัปเดตอัตโนมัติ</p>
  </section>`;
  for (let i = 0; i < 90; i++) {
    if (seq !== routeSeq) return;
    try {
      const data = await api(`/api/order?session=${encodeURIComponent(session)}`);
      if (seq !== routeSeq) return;
      if (data.order.status !== "pending") {
        document.title = `คำสั่งซื้อ ${data.order.number}`;
        app.innerHTML = orderBoxHtml(data.order);
        return;
      }
    } catch { /* รอแล้วลองใหม่ */ }
    await new Promise((r) => setTimeout(r, 4000));
  }
  const note = document.getElementById("poll-note");
  if (note) note.textContent = "ยังไม่ได้รับการยืนยันการชำระเงิน — หากชำระแล้ว สถานะจะอัปเดตเองภายในไม่กี่นาที (ลองรีเฟรชหน้าอีกครั้ง)";
}

function orderBoxHtml(o) {
  const meta = STATUS_META[o.status] || { label: o.status, cls: "" };
  const physical = o.items.some((i) => i.type === "physical");
  const notices = {
    pending: `<div class="notice">รอการยืนยันการชำระเงิน — หากยังเปิดหน้าชำระเงินของ Stripe อยู่ ให้ชำระให้เสร็จ หน้านี้จะอัปเดตสถานะเอง</div>`,
    paid: `<div class="notice ok">ได้รับชำระเงินเรียบร้อยแล้ว ทางร้านจะจัดเตรียมและจัดส่งให้เร็วที่สุด</div>`,
    shipped: `<div class="notice ok">จัดส่งแล้ว — ตรวจสอบเลขพัสดุด้านล่างได้เลย</div>`,
    expired: `<div class="notice warn">คำสั่งซื้อหมดเวลาชำระเงิน — สินค้าถูกคืนสต๊อกแล้ว เริ่มตะกร้าใหม่ได้ที่ <a data-link href="/">หน้าสินค้า</a></div>`,
    failed: `<div class="notice warn">ชำระเงินไม่สำเร็จ — ลองสั่งซื้อใหม่อีกครั้ง หรือติดต่อร้านหากมีปัญหา</div>`,
  };
  return `
  <section class="container order-page">
    <div class="order-head">
      <div>
        <p class="muted sm">เลขคำสั่งซื้อ</p>
        <h1 class="order-no">${esc(o.number)}
          <button class="btn ghost sm" data-action="copy-number" data-copy="${esc(o.number)}">คัดลอก</button>
        </h1>
        <p class="muted sm">สั่งเมื่อ ${fmtDate(o.created_at)}${o.payment_method ? ` · ชำระผ่าน ${o.payment_method === "promptpay" ? "พร้อมเพย์" : "บัตร"}` : ""}</p>
      </div>
      <span class="status ${meta.cls}">${esc(meta.label)}</span>
    </div>
    ${notices[o.status] || ""}
    <div class="order-grid">
      <div class="card pad order-items">
        <h2>รายการสินค้า</h2>
        ${o.items.map(itemHtml).join("")}
        <dl class="totals">
          <div><dt>ยอดสินค้า</dt><dd>${thb(o.subtotal_thb)}</dd></div>
          <div><dt>ค่าจัดส่ง</dt><dd>${o.shipping_thb ? thb(o.shipping_thb) : "ฟรี"}</dd></div>
          ${o.discount_thb ? `<div><dt>ส่วนลด${o.coupon_code ? ` (${esc(o.coupon_code)})` : ""}</dt><dd>-${thb(o.discount_thb)}</dd></div>` : ""}
          <div class="grand"><dt>รวมทั้งสิ้น</dt><dd>${thb(o.total_thb)}</dd></div>
        </dl>
      </div>
      <aside class="order-side">
        ${physical ? `<div class="card pad">
          <h2>ที่อยู่จัดส่ง</h2>
          <p class="sm">${esc(o.name)}<br>${esc(o.phone)}<br>
          ${esc(o.address.line)}<br>
          ${esc(o.address.subdistrict)} ${esc(o.address.district)}<br>
          ${esc(o.address.province)} ${esc(o.address.postcode)}</p>
          ${o.tracking_number ? `<p><strong>เลขพัสดุ:</strong> ${esc(o.tracking_number)}</p>` : ""}
        </div>` : ""}
        <div class="card pad">
          <h2>ต้องการความช่วยเหลือ?</h2>
          <p class="muted sm">โทร ${esc(SHOP.contact.phone)}<br>LINE ${esc(SHOP.contact.line)}<br>อีเมลของคุณ: ${esc(o.email)}</p>
        </div>
      </aside>
    </div>
  </section>`;
}

function itemHtml(it) {
  const dl = it.download_url
    ? `<a class="btn primary sm" href="${esc(it.download_url)}">ดาวน์โหลด${it.downloads_left != null ? ` (เหลือ ${it.downloads_left} ครั้ง)` : ""}</a>` : "";
  const access = it.access_url
    ? `<a class="btn outline sm" href="${esc(it.access_url)}" target="_blank" rel="noopener">เปิดลิงก์เข้าถึง</a>` : "";
  const pendingDl = it.type === "digital" && !dl && !access ? `<span class="muted sm">ลิงก์จะปรากฏหลังชำระเงินสำเร็จ</span>` : "";
  return `
  <div class="order-item">
    ${imgOr({ image: it.image, name: it.name }, "thumb")}
    <div class="order-item-info">
      <a data-link href="/product/${esc(it.slug)}"><strong>${esc(it.name)}</strong></a>
      <p class="muted sm">จำนวน ${it.qty} × ${thb(it.price)}</p>
      ${it.type === "digital" ? `<div class="dl-actions">${dl}${access}${pendingDl}</div>` : ""}
    </div>
    <strong>${thb(it.price * it.qty)}</strong>
  </div>`;
}

/* ── หน้ากฎหมาย ── */
function legalView(which) {
  const titles = { terms: "เงื่อนไขการใช้บริการ", privacy: "นโยบายความเป็นส่วนตัว (PDPA)" };
  document.title = `${titles[which]} — ${SHOP.name}`;
  const paras = SHOP.legal[which] || [];
  app.innerHTML = `<section class="container legal">
    <h1>${titles[which]}</h1>
    ${paras.map((p) => `<p>${esc(p)}</p>`).join("")}
    <p class="muted sm">อัปเดตล่าสุด: ${new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}</p>
    <a data-link class="btn ghost sm" href="/">← กลับหน้าร้าน</a>
  </section>`;
}

/* ── โทนสีจากตั้งค่าร้าน (ปรับได้ที่ /admin.html) ── */
(async function applyTheme() {
  try {
    const data = await api("/api/config");
    const t = data.theme || {};
    const root = document.documentElement.style;
    if (t.bg) root.setProperty("--bg", t.bg);
    if (t.brand) root.setProperty("--brand", t.brand);
    if (t.brandStrong) root.setProperty("--brand-strong", t.brandStrong);
    if (t.accent) root.setProperty("--accent", t.accent);
  } catch { /* ใช้สีเริ่มต้น */ }
})();

updateBadge();
render();
