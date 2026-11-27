// แผงผู้ดูแล — ภาพรวม / สินค้า / คูปอง / คำสั่งซื้อ / การเงิน / ตั้งค่า (+audit)
import { api, esc, thb, fmtDate, imgOr, toast } from "./core.js";

const $ = (sel, el = document) => el.querySelector(sel);
const main = document.getElementById("admin-main");
const dialog = document.getElementById("product-dialog");
const couponDialog = document.getElementById("coupon-dialog");
const state = {
  tab: "dash", editingId: null, couponEditingId: null,
  products: [], coupons: [], orders: [], transactions: [], lineUsers: [], lineGroups: [],
  orderFilter: "", financeYear: String(new Date().getFullYear()),
  financeMonth: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7),
  settings: null, flags: {}, financeData: null, audit: [],
};
const SHOP_NAME = "เปรมปรี ศรีนาราง";
const ORDER_STATUS = { pending: "รอชำระเงิน", paid: "ชำระแล้ว", shipped: "จัดส่งแล้ว", expired: "หมดเวลา", failed: "ไม่สำเร็จ" };
const PROVIDERS = ["ไปรษณีย์ไทย", "ไปรษณีย์ไทย (EMS)", "Flash Express", "Kerry Express (KEX)", "J&T Express", "อื่นๆ"];
const EXPENSE_CATEGORIES = ["ต้นทุนสินค้า", "ค่าจัดส่ง/ขนส่ง", "ค่าโฆษณา/การตลาด", "ค่าธรรมเนียม Stripe", "ค่าใช้จ่ายร้าน", "ภาษี/ค่าธรรมเนียม", "อื่นๆ"];
const REPORT_TYPE = { daily: "รายวัน", monthly: "รายเดือน", quarterly: "รายไตรมาส", yearly: "รายปี" };
const QUARTER_RANGE = { 1: "ม.ค.–มี.ค.", 2: "เม.ย.–มิ.ย.", 3: "ก.ค.–ก.ย.", 4: "ต.ค.–ธ.ค." };
const PRESETS = {
  cha:      { name: "ชาอ่อน",       bg: "#f7f1e6", brand: "#9c7248", brandStrong: "#7c5836", accent: "#c8973a" },
  olive:    { name: "เขียวมะกอก",   bg: "#f2f2ec", brand: "#6f7d54", brandStrong: "#57633f", accent: "#a3b06f" },
  rose:     { name: "ชมพูพาสเทล",   bg: "#faf0ee", brand: "#b56b6b", brandStrong: "#8f4f4f", accent: "#d99a8a" },
  navy:     { name: "น้ำเงินหม่น",   bg: "#eef1f5", brand: "#4f6d8c", brandStrong: "#3b5570", accent: "#7f9cbd" },
  lavender: { name: "ม่วงลาวานเดอร์", bg: "#f3f0f7", brand: "#7c6a9c", brandStrong: "#5f4f80", accent: "#a897c9" },
  terracotta: { name: "ส้มดินเผา",  bg: "#f8f0ea", brand: "#b3573f", brandStrong: "#8c4232", accent: "#d98e6a" },
  forest:   { name: "เขียวป่าลึก",   bg: "#eef3ee", brand: "#3f6b4f", brandStrong: "#2f523c", accent: "#7fae8e" },
  sand:     { name: "ทรายทอง",      bg: "#f9f4e8", brand: "#b08d3e", brandStrong: "#8a6d2e", accent: "#d4b96a" },
  slate:    { name: "เทาหินลื่น",    bg: "#f1f2f4", brand: "#5b6470", brandStrong: "#454d57", accent: "#93a1b0" },
  wine:     { name: "ไวน์แดง",      bg: "#f7eef0", brand: "#8c3b52", brandStrong: "#6e2c3f", accent: "#c07a8f" },
  teal:     { name: "เขียวน้ำทะเล",  bg: "#edf4f4", brand: "#3e7373", brandStrong: "#2e5858", accent: "#6fa3a3" },
};

(async function boot() {
  try {
    await api("/admin-api/me");
    showPanel();
  } catch { /* ยังไม่ล็อกอิน */ }
})();

function showPanel() {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("panel-view").classList.remove("hidden");
  loadTab(state.tab);
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = "กำลังตรวจสอบ…";
  try {
    await api("/admin-api/login", { body: { password: new FormData(e.target).get("password") } });
    showPanel();
  } catch (err) {
    $("#login-msg").textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = "เข้าสู่ระบบ";
  }
});

document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tabbtn");
  if (b) loadTab(b.dataset.tab);
});
document.getElementById("logout-btn").addEventListener("click", async () => {
  try { await api("/admin-api/logout", { body: {} }); } catch {}
  location.reload();
});

async function loadTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tabbtn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  main.innerHTML = `<p class="muted">กำลังโหลด…</p>`;
  try {
    if (tab === "dash") await renderDash();
    else if (tab === "products") await renderProducts();
    else if (tab === "coupons") await renderCoupons();
    else if (tab === "orders") await renderOrders();
    else if (tab === "finance") await renderFinance();
    else await renderSettings();
  } catch (err) {
    main.innerHTML = `<div class="card pad"><p>${esc(err.message)}</p></div>`;
  }
}

/* ════════ ภาพรวม ════════ */
async function renderDash() {
  const { stats: s } = await api("/admin-api/stats");
  main.innerHTML = `
    <h1>ภาพรวม</h1>
    <div class="kpi-grid">
      <div class="kpi"><span>รายได้รวม (ชำระแล้ว)</span><strong>${thb(s.revenue_thb)}</strong></div>
      <div class="kpi${s.to_ship ? " warn" : ""}"><span>รอจัดส่ง</span><strong>${s.to_ship}</strong></div>
      <div class="kpi"><span>รอชำระเงิน</span><strong>${s.pending_orders}</strong></div>
      <div class="kpi"><span>จัดส่งแล้ว</span><strong>${s.shipped_orders}</strong></div>
      <div class="kpi"><span>สินค้าทั้งหมด</span><strong>${s.products}</strong></div>
      <div class="kpi${s.low_stock ? " warn" : ""}"><span>สต๊อกใกล้หมด (≤5)</span><strong>${s.low_stock}</strong></div>
    </div>`;
}

/* ════════ สินค้า ════════ */
async function renderProducts() {
  const data = await api("/admin-api/products");
  state.products = data.products;
  main.innerHTML = `
    <div class="toolbar-row">
      <h1>สินค้า</h1>
      <button class="btn primary" id="add-product">+ เพิ่มสินค้า</button>
    </div>
    <div class="table-wrap card">
      <table class="admin-table">
        <thead><tr><th>สินค้า</th><th>ประเภท</th><th>ราคา</th><th>สต๊อก</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${state.products.map(productRowHtml).join("") || `<tr><td colspan="6" class="muted center">ยังไม่มีสินค้า</td></tr>`}</tbody>
      </table>
    </div>`;
  $("#add-product").addEventListener("click", () => openDialog(null));
}

function productRowHtml(p) {
  const digital = p.type === "digital";
  const low = !digital && (p.stock ?? 0) <= 5;
  return `
  <tr>
    <td><div class="prod-cell">${imgOr({ image: p.image, name: p.name }, "thumb")}<div><strong>${esc(p.name)}</strong><div class="muted sm">/${esc(p.slug)}</div></div></div></td>
    <td>${digital ? "ดิจิทัล" : "จัดส่ง"}</td>
    <td>${thb(p.price_thb)}${p.compare_at ? ` <s class="muted sm">${thb(p.compare_at)}</s>` : ""}</td>
    <td>${digital ? "ไม่จำกัด" : `<span class="${low ? "warn-text" : ""}">${p.stock ?? "-"}</span>
      <span class="stock-tools">
        <input type="number" data-stock-input="${esc(p.id)}" value="${p.stock ?? 0}" min="0">
        <button class="btn ghost sm" data-action="stock-save" data-id="${esc(p.id)}">บันทึก</button>
      </span>`}</td>
    <td><span class="status ${p.active ? "paid" : "expired"}">${p.active ? "เปิดขาย" : "ปิดขาย"}</span></td>
    <td class="row-actions">
      <button class="btn ghost sm" data-action="edit" data-id="${esc(p.id)}">แก้ไข</button>
      <button class="btn danger sm" data-action="del" data-id="${esc(p.id)}">ลบ</button>
    </td>
  </tr>`;
}

/* ════════ คูปอง ════════ */
async function renderCoupons() {
  const data = await api("/admin-api/coupons");
  state.coupons = data.coupons;
  main.innerHTML = `
    <div class="toolbar-row">
      <h1>คูปองส่วนลด</h1>
      <button class="btn primary" id="add-coupon">+ เพิ่มคูปอง</button>
    </div>
    <div class="table-wrap card">
      <table class="admin-table">
        <thead><tr><th>โค้ด</th><th>ส่วนลด</th><th>ยอดขั้นต่ำ</th><th>ใช้แล้ว</th><th>ช่วงเวลา</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${state.coupons.map(couponRowHtml).join("") || `<tr><td colspan="7" class="muted center">ยังไม่มีคูปอง</td></tr>`}</tbody>
      </table>
    </div>
    <p class="muted sm">ลูกค้าใส่โค้ดได้ที่หน้าชำระเงิน — ส่วนลดแสดงบนหน้าชำระเงิน Stripe และบันทึกลงยอดออเดอร์อัตโนมัติ</p>`;
  $("#add-coupon").addEventListener("click", () => openCouponDialog(null));
}

function couponRowHtml(c) {
  const label = c.kind === "percent" ? `${c.value}%${c.max_discount_thb ? ` (สูงสุด ฿${c.max_discount_thb.toLocaleString("th-TH")})` : ""}` : `฿${c.value.toLocaleString("th-TH")}`;
  const range = `${c.starts_at ? fmtDate(c.starts_at) : "เริ่มทันที"} → ${c.ends_at ? fmtDate(c.ends_at) : "ไม่จำกัด"}`;
  return `
  <tr>
    <td><strong>${esc(c.code)}</strong></td>
    <td>${esc(label)}</td>
    <td>${c.min_subtotal_thb ? thb(c.min_subtotal_thb) : "-"}</td>
    <td>${c.used_count}${c.usage_limit ? "/" + c.usage_limit : ""} ครั้ง</td>
    <td class="muted sm">${esc(range)}</td>
    <td><span class="status ${c.active ? "paid" : "expired"}">${c.active ? "เปิดใช้" : "ปิดใช้"}</span></td>
    <td class="row-actions">
      <button class="btn ghost sm" data-action="edit-coupon" data-id="${esc(c.id)}">แก้ไข</button>
      <button class="btn danger sm" data-action="del-coupon" data-id="${esc(c.id)}">ลบ</button>
    </td>
  </tr>`;
}

/* ════════ คำสั่งซื้อ ════════ */
async function renderOrders() {
  const qs = state.orderFilter ? `?status=${state.orderFilter}` : "";
  const data = await api(`/admin-api/orders${qs}`);
  state.orders = data.orders;
  const options = ["", "pending", "paid", "shipped", "expired", "failed"]
    .map((s) => `<option value="${s}"${state.orderFilter === s ? " selected" : ""}>${s ? ORDER_STATUS[s] : "ทั้งหมด"}</option>`)
    .join("");
  main.innerHTML = `
    <div class="toolbar-row">
      <h1>คำสั่งซื้อ</h1>
      <select id="order-filter" class="select">${options}</select>
    </div>
    <div class="orders-list">
      ${data.orders.map(orderCardHtml).join("") || `<p class="muted">ไม่มีคำสั่งซื้อในสถานะนี้</p>`}
    </div>`;
  $("#order-filter").addEventListener("change", (e) => {
    state.orderFilter = e.target.value;
    loadTab("orders");
  });
}

function orderCardHtml(o) {
  const hasAddress = Boolean(o.address);
  const providerOptions = PROVIDERS
    .map((p) => `<option value="${esc(p)}"${(o.shipping_provider || (state.settings?.shipping?.provider || "")) === p ? " selected" : ""}>${esc(p)}</option>`)
    .join("");
  return `
  <article class="card pad order-card">
    <header class="order-card-head">
      <div>
        <strong>${esc(o.number)}</strong>
        <span class="status ${o.status}">${ORDER_STATUS[o.status] || o.status}</span>
        ${o.pickup_status === "requested" ? `<span class="status pending">นัดเข้ารับพัสดุแล้ว</span>` : ""}
        <p class="muted sm">${fmtDate(o.created_at)} · ชำระผ่าน ${o.payment_method === "promptpay" ? "พร้อมเพย์" : o.payment_method === "card" ? "บัตร" : "-"}${o.coupon_code ? ` · โค้ด ${esc(o.coupon_code)}` : ""}</p>
      </div>
      <strong>${thb(o.total_thb)}</strong>
    </header>
    <p class="sm">ลูกค้า: ${esc(o.name)} · ${esc(o.email)}${o.phone ? ` · ${esc(o.phone)}` : ""}</p>
    <ul class="sm">${o.items.map((i) => `<li>${esc(i.name)} × ${i.qty} — ${thb(i.price * i.qty)}</li>`).join("")}</ul>
    ${hasAddress ? `<p class="sm muted">จัดส่งที่: ${esc(o.address)} ${esc(o.addr_subdist)} ${esc(o.addr_district)} ${esc(o.addr_province)} ${esc(o.addr_postcode)}</p>` : ""}
    ${o.tracking_number ? `<p class="sm"><strong>เลขพัสดุ:</strong> ${esc(o.tracking_number)}${o.shipping_provider ? ` (${esc(o.shipping_provider)})` : ""}</p>` : ""}
    ${o.status === "paid" ? `
    <div class="ship-row">
      ${!o.pickup_status ? `<button class="btn ghost sm" data-action="pickup" data-id="${esc(o.id)}">📍 แจ้งขนส่งเข้ารับพัสดุ</button>` : ""}
      <input data-track-input="${esc(o.id)}" placeholder="เลขพัสดุ">
      <select data-provider-input="${esc(o.id)}" class="select">${providerOptions}</select>
      <button class="btn primary sm" data-action="ship" data-id="${esc(o.id)}">ยืนยันจัดส่ง</button>
    </div>` : ""}
    ${(o.status === "paid" || o.status === "shipped") && hasAddress ? `<div class="order-tools"><button class="btn ghost sm" data-action="print-label" data-id="${esc(o.id)}">🖨 พิมพ์ใบปะหน้าพัสดุ</button></div>` : ""}
  </article>`;
}

/* ════════ การเงิน ════════ */
async function renderFinance() {
  const year = state.financeYear;
  const [data, tx, daily, products, quarterlyData, reports] = await Promise.all([
    api(`/admin-api/finance/summary?year=${year}`),
    api(`/admin-api/finance/transactions?year=${year}`),
    api(`/admin-api/finance/sales-daily?month=${state.financeMonth}`),
    api(`/admin-api/finance/sales-products?year=${year}`),
    api(`/admin-api/finance/quarterly?year=${year}`),
    api(`/admin-api/finance/reports`),
  ]);
  state.financeData = { ...data, quarters: quarterlyData.quarters, reports: reports.reports };
  state.transactions = tx.transactions;
  state.financeYear = data.year;

  const todayBkk = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const years = [Number(year) - 1, Number(year), Number(year) + 1];
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  const monthRows = data.monthly
    .map((m) => `<tr><td>${esc(monthLabel(m.ym))}</td><td class="num">${thb(m.income)}</td><td class="num">${thb(m.expense)}</td><td class="num">${thb(m.income - m.expense)}</td></tr>`)
    .join("") || `<tr><td colspan="4" class="muted center">ไม่มีข้อมูลในปีนี้</td></tr>`;
  const catRows = data.expenseCategories
    .map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${thb(c.total)}</td></tr>`)
    .join("") || `<tr><td colspan="2" class="muted center">ยังไม่มีรายจ่าย</td></tr>`;
  const dailyRows = daily.rows
    .map((d) => `<tr><td class="mono">${esc(d.day)}</td><td class="num">${d.orders}</td><td class="num">${thb(d.revenue)}</td></tr>`)
    .join("") || `<tr><td colspan="3" class="muted center">ไม่มียอดขายในเดือนนี้</td></tr>`;
  const productRows = products.rows
    .map((p, i) => `<tr><td>${i + 1}. ${esc(p.name)}</td><td class="num">${p.qty}</td><td class="num">${thb(p.revenue)}</td></tr>`)
    .join("") || `<tr><td colspan="3" class="muted center">ยังไม่มียอดขาย</td></tr>`;
  const quarterRows = quarterlyData.quarters
    .map((q) => `<tr>
      <td><strong>ไตรมาส ${q.q}</strong><div class="muted sm">${QUARTER_RANGE[q.q]}</div></td>
      <td class="num">${thb(q.income)}</td><td class="num">${thb(q.expense)}</td><td class="num">${thb(q.profit)}</td>
      <td class="num">${q.orders_count}</td>
      <td class="row-actions">
        <button class="btn ghost sm" data-action="print-quarter" data-q="${q.q}">🖨 พิมพ์</button>
        <button class="btn outline sm" data-action="store-quarter" data-q="${q.q}">จัดเก็บ</button>
      </td>
    </tr>`)
    .join("");
  const reportRows = reports.reports
    .map((r) => `<tr>
      <td>${REPORT_TYPE[r.period_type] || r.period_type}</td>
      <td><strong>${esc(r.period)}</strong></td>
      <td class="num">${thb(r.income_thb)}</td><td class="num">${thb(r.expense_thb)}</td><td class="num">${thb(r.profit_thb)}</td>
      <td class="num">${r.orders_count}</td>
      <td class="muted sm">${fmtDate(r.created_at)}${r.created_by === "auto" ? " · อัตโนมัติ" : ""}</td>
      <td class="row-actions">
        <button class="btn ghost sm" data-action="view-report" data-id="${esc(r.id)}">ดู</button>
        <a class="btn outline sm" href="/admin-api/finance/reports/${esc(r.id)}/export.csv">CSV</a>
        <button class="btn danger sm" data-action="del-report" data-id="${esc(r.id)}">ลบ</button>
      </td>
    </tr>`)
    .join("") || `<tr><td colspan="8" class="muted center">ยังไม่มีรายงานที่จัดเก็บ</td></tr>`;

  const finCard = (title, d) => `
    <div class="fin-card">
      <h3>${title}</h3>
      <div class="fin-row"><span>รายรับ</span><strong class="pos">${thb(d.income)}</strong></div>
      <div class="fin-row"><span>รายจ่าย</span><strong class="neg">${thb(d.expense)}</strong></div>
      <div class="fin-row"><span>กำไรสุทธิ</span><strong>${thb(d.profit)}</strong></div>
    </div>`;

  main.innerHTML = `
    <div class="toolbar-row">
      <h1>การเงิน — รายรับรายจ่าย และรายงาน</h1>
      <span>
        <select id="finance-year" class="select">${years.map((y) => `<option value="${y}"${String(y) === year ? " selected" : ""}>ปี ${y} (พ.ศ. ${y + 543})</option>`).join("")}</select>
        <a class="btn outline sm" href="/admin-api/finance/export.csv?year=${year}">ส่งออก CSV</a>
        <button class="btn ghost sm" data-action="print-statement">🖨 พิมพ์ใบสรุปประจำปี</button>
      </span>
    </div>
    <div class="fin-kpis">
      ${finCard("วันนี้", data.today)}
      ${finCard("เดือนนี้", data.month)}
      ${finCard(`ปี ${year} ทั้งหมด`, data.yearSummary)}
    </div>
    <div class="settings-grid">
      <div class="card pad">
        <h2>สรุปรายเดือน</h2>
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>เดือน</th><th class="num">รายรับ</th><th class="num">รายจ่าย</th><th class="num">กำไร</th></tr></thead>
            <tbody>${monthRows}</tbody>
          </table>
        </div>
        <h2>รายจ่ายตามหมวด (ทั้งปี)</h2>
        <div class="table-wrap">
          <table class="admin-table"><tbody>${catRows}</tbody></table>
        </div>
      </div>
      <div>
        <div class="card pad">
          <h2>บันทึกรายรับ/รายจ่าย</h2>
          <form id="tx-form">
            <div class="field-row">
              <label class="field"><span>ประเภท *</span>
                <select name="kind" id="tx-kind">
                  <option value="expense">รายจ่าย</option>
                  <option value="income">รายรับ (อื่นๆ)</option>
                </select>
              </label>
              <label class="field"><span>หมวดหมู่</span><select name="category" id="tx-category">${EXPENSE_CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
            </div>
            <div class="field-row">
              <label class="field"><span>จำนวนเงิน (บาท) *</span><input name="amount" type="number" min="1" step="1" required></label>
              <label class="field"><span>วันที่ *</span><input name="date" type="date" required value="${todayBkk}"></label>
            </div>
            <label class="field"><span>หมายเหตุ</span><input name="note" maxlength="300" placeholder="เช่น ค่ากล่อง+เทป ซื้อจากร้าน ABC"></label>
            <button class="btn primary block" type="submit">บันทึกรายการ</button>
          </form>
        </div>
        <div class="card pad">
          <h2>รายการล่าสุด</h2>
          <div class="tx-list">
            ${state.transactions.slice(0, 20).map(txItemHtml).join("") || `<p class="muted sm">ยังไม่มีรายการ</p>`}
          </div>
        </div>
      </div>
    </div>

    <div class="card pad report-section">
      <h2>📈 บันทึกยอดขายรายวัน</h2>
      <div class="toolbar-row">
        <select id="sales-month" class="select">${months.map((m) => `<option value="${m}"${m === state.financeMonth ? " selected" : ""}>${monthLabel(m)}</option>`).join("")}</select>
        <span class="muted sm">ออเดอร์ที่ชำระเงินรายวัน (จากสมุดรายรับ)</span>
      </div>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr><th>วันที่</th><th class="num">ออเดอร์</th><th class="num">รายรับ</th></tr></thead>
          <tbody>${dailyRows}</tbody>
        </table>
      </div>
      <h2>🏆 สินค้าขายดี (ปี ${year})</h2>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr><th>สินค้า</th><th class="num">จำนวนชิ้น</th><th class="num">รายรับ</th></tr></thead>
          <tbody>${productRows}</tbody>
        </table>
      </div>
    </div>

    <div class="card pad report-section">
      <h2>🧾 รายงานภาษีรายไตรมาส (ปี ${year})</h2>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr><th>งวด</th><th class="num">รายรับ</th><th class="num">รายจ่าย</th><th class="num">กำไร</th><th class="num">ออเดอร์</th><th></th></tr></thead>
          <tbody>${quarterRows}</tbody>
        </table>
      </div>
      <p class="muted sm">ใช้ประกอบการยื่นแบบรายงวด เช่น ภ.ง.ด.30 (VAT) หรือเตรียมข้อมูล ภ.ง.ด.94/90 — ตัวเลขและค่าใช้จ่ายที่หักได้จริงควรให้ผู้ทำบัญชีตรวจก่อนยื่น</p>
    </div>

    <div class="card pad report-section">
      <h2>🗄 รายงานที่จัดเก็บไว้ (snapshot ตามงวด)</h2>
      <div class="report-actions">
        <select id="report-type" class="select">
          <option value="monthly">รายเดือน (เดือนนี้)</option>
          <option value="quarterly">รายไตรมาส (ไตรมาสนี้)</option>
          <option value="yearly">รายปี (ปีนี้)</option>
        </select>
        <button class="btn primary sm" id="store-report">จัดเก็บรายงานตอนนี้</button>
        <button class="btn outline sm" id="notify-today">ส่งสรุปวันนี้เข้า LINE</button>
        <span class="muted sm">ระบบจัดเก็บงวดที่จบไปแล้วให้อัตโนมัติทุกครั้งที่เปิดหน้านี้</span>
      </div>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr><th>ประเภท</th><th>งวด</th><th class="num">รายรับ</th><th class="num">รายจ่าย</th><th class="num">กำไร</th><th class="num">ออเดอร์</th><th>จัดเก็บเมื่อ</th><th></th></tr></thead>
          <tbody>${reportRows}</tbody>
        </table>
      </div>
    </div>`;

  $("#finance-year").addEventListener("change", (e) => {
    state.financeYear = e.target.value;
    state.financeMonth = `${e.target.value}-01`;
    loadTab("finance");
  });
  $("#sales-month").addEventListener("change", (e) => {
    state.financeMonth = e.target.value;
    loadTab("finance");
  });
  $("#tx-kind").addEventListener("change", (e) => {
    const cat = $("#tx-category");
    cat.innerHTML = e.target.value === "income" ? `<option>รายรับอื่นๆ</option>` : EXPENSE_CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("");
  });
  $("#tx-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("/admin-api/finance/transactions", {
        body: { kind: fd.get("kind"), category: fd.get("category"), amount: Number(fd.get("amount")), date: fd.get("date"), note: String(fd.get("note") || "").trim() },
      });
      toast("บันทึกรายการแล้ว");
      loadTab("finance");
    } catch (err) { toast(err.message, true); }
  });
  $("#store-report").addEventListener("click", async () => {
    try { await api("/admin-api/finance/reports", { body: { period_type: $("#report-type").value } }); toast("จัดเก็บรายงานแล้ว"); loadTab("finance"); }
    catch (err) { toast(err.message, true); }
  });
  $("#notify-today").addEventListener("click", async () => {
    try { const r = await api("/admin-api/finance/notify-today", { body: {} }); toast(`ส่งสรุปวันนี้เข้า LINE แล้ว (${r.sent} กลุ่ม)`); }
    catch (err) { toast(err.message, true); }
  });
}

function txItemHtml(t) {
  const sign = t.kind === "income" ? "+" : "-";
  return `
  <div class="tx-item">
    <span class="muted sm mono">${esc(t.occurred_on)}</span>
    <span>${esc(t.category)}</span>
    <span class="muted sm">${esc(t.note || "")}${t.order_number ? ` (${esc(t.order_number)})` : ""}</span>
    <span class="tx-amt ${t.kind === "income" ? "pos" : "neg"}">${sign}${thb(t.amount_thb)}</span>
    ${!t.order_id ? `<button class="link-btn" data-action="del-tx" data-id="${esc(t.id)}">ลบ</button>` : ""}
  </div>`;
}

function monthLabel(ym) {
  try {
    return new Date(`${ym}-01`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  } catch { return ym; }
}

function quarterYmList(year, q) {
  const start = (q - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(start + i).padStart(2, "0")}`);
}

function showReportDialog(r) {
  const snap = r.snapshot || {};
  const parts = [];
  if (Array.isArray(snap.monthly) && snap.monthly.length) {
    parts.push(`<h3>สรุปรายเดือน</h3><table class="admin-table"><thead><tr><th>เดือน</th><th class="num">รายรับ</th><th class="num">รายจ่าย</th><th class="num">กำไร</th></tr></thead><tbody>${snap.monthly.map((m) => `<tr><td>${esc(monthLabel(m.ym))}</td><td class="num">${thb(m.income)}</td><td class="num">${thb(m.expense)}</td><td class="num">${thb(m.income - m.expense)}</td></tr>`).join("")}</tbody></table>`);
  }
  if (Array.isArray(snap.daily) && snap.daily.length) {
    parts.push(`<h3>บันทึกยอดขายรายวัน</h3><table class="admin-table"><thead><tr><th>วันที่</th><th class="num">ออเดอร์</th><th class="num">รายรับ</th></tr></thead><tbody>${snap.daily.map((d) => `<tr><td class="mono">${esc(d.day)}</td><td class="num">${d.orders}</td><td class="num">${thb(d.revenue)}</td></tr>`).join("")}</tbody></table>`);
  }
  if (Array.isArray(snap.categories) && snap.categories.length) {
    parts.push(`<h3>รายจ่ายตามหมวด</h3><table class="admin-table"><tbody>${snap.categories.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${thb(c.total)}</td></tr>`).join("")}</tbody></table>`);
  }
  if (Array.isArray(snap.topProducts) && snap.topProducts.length) {
    parts.push(`<h3>สินค้าขายดี</h3><table class="admin-table"><tbody>${snap.topProducts.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${p.qty} ชิ้น</td><td class="num">${thb(p.revenue)}</td></tr>`).join("")}</tbody></table>`);
  }
  const d = document.createElement("dialog");
  d.className = "product-dialog";
  d.innerHTML = `
    <h2>${REPORT_TYPE[r.period_type] || r.period_type} · ${esc(r.period)}</h2>
    <dl class="totals">
      <div><dt>รายรับ</dt><dd>${thb(r.income_thb)}</dd></div>
      <div><dt>รายจ่าย</dt><dd>${thb(r.expense_thb)}</dd></div>
      <div><dt>ออเดอร์/ชิ้น</dt><dd>${r.orders_count} / ${r.items_count}</dd></div>
      <div class="grand"><dt>กำไรสุทธิ</dt><dd>${thb(r.profit_thb)}</dd></div>
    </dl>
    ${parts.join("")}
    <div class="dialog-actions"><button class="btn ghost" id="rd-close">ปิด</button></div>`;
  document.body.appendChild(d);
  d.showModal();
  d.querySelector("#rd-close").addEventListener("click", () => { d.close(); d.remove(); });
  d.addEventListener("click", (e) => { if (e.target === d) { d.close(); d.remove(); } });
}

/* ════════ ตั้งค่า ════════ */
async function renderSettings() {
  const [data, lineData, auditData] = await Promise.all([
    api("/admin-api/settings"),
    api("/admin-api/line-users"),
    api("/admin-api/audit"),
  ]);
  state.settings = data.settings;
  state.flags = data.flags;
  state.lineUsers = lineData.users;
  state.lineGroups = [...(data.settings.line.groups || [])];
  state.audit = auditData.audit;
  const s = state.settings;

  main.innerHTML = `
    <h1>ตั้งค่าร้าน</h1>
    <div class="settings-grid">
      <div class="card pad settings-card">
        <h2>🎨 โทนสีร้าน</h2>
        <p class="muted sm">เลือกพรีเซ็ต (${Object.keys(PRESETS).length} โทน) หรือเลือกสีหลักเอง — หน้าร้านเปลี่ยนสีอัตโนมัติ</p>
        <div class="preset-row" id="preset-row"></div>
        <div class="color-row">
          <label class="field"><span>สีหลักแบบกำหนดเอง</span><input type="color" id="custom-brand" value="${esc(s.theme.brand)}"></label>
        </div>
        <div class="theme-preview" id="theme-preview">ตัวอย่างปุ่มสั่งซื้อ · ฿990</div>
        <button class="btn primary" id="save-theme">บันทึกโทนสี</button>
      </div>

      <div class="card pad settings-card">
        <h2>🚚 ระบบขนส่ง / เข้ารับพัสดุ</h2>
        <label class="field"><span>ขนส่งหลักของร้าน</span>
          <select id="ship-provider">${PROVIDERS.map((p) => `<option${s.shipping.provider === p ? " selected" : ""}>${esc(p)}</option>`).join("")}</select>
        </label>
        <label class="check"><input type="checkbox" id="ship-pickup" ${s.shipping.pickup_enabled ? "checked" : ""}> เปิดใช้ปุ่ม “แจ้งขนส่งเข้ารับพัสดุ” ในหน้าคำสั่งซื้อ</label>
        <label class="field"><span>หมายเหตุการนัดรับ (แสดงในใบปะหน้า)</span><input id="ship-pickup-note" value="${esc(s.shipping.pickup_note || "")}" placeholder="เช่น นัดรับทุกวัน 14:00 ที่หน้าร้าน"></label>
        <label class="field"><span>ลิงก์ติดตามพัสดุ (ใช้ {tracking} แทนเลขพัสดุ)</span><input id="ship-tracking-url" value="${esc(s.shipping.tracking_url || "")}" placeholder="https://track.thailandpost.com/?track={tracking}"></label>
        <button class="btn primary" id="save-shipping">บันทึกระบบขนส่ง</button>
      </div>

      <div class="card pad settings-card">
        <h2>📧 อีเมลแจ้งออเดอร์ (Resend)</h2>
        <p class="muted sm">สถานะ: ${state.flags.resend ? "✓ ตั้งค่า RESEND_API_KEY แล้ว" : "ยังไม่ได้ตั้ง RESEND_API_KEY — ระบบจะข้ามการส่งอีเมล"}<br>ผู้ส่ง: ${esc(state.flags.email_from || "-")}</p>
        <label class="check"><input type="checkbox" id="email-paid" ${s.email.notify_paid ? "checked" : ""}> ส่งอีเมลเมื่อลูกค้าชำระเงินสำเร็จ</label>
        <label class="check"><input type="checkbox" id="email-shipped" ${s.email.notify_shipped ? "checked" : ""}> ส่งอีเมลเมื่อจัดส่งแล้ว (พร้อมเลขพัสดุ)</label>
        <button class="btn primary" id="save-email">บันทึกการอีเมล</button>
      </div>

      <div class="card pad settings-card">
        <h2>💬 LINE OA — แจ้งเตือนหลายกลุ่ม / รายบุคคล</h2>
        <label class="check"><input type="checkbox" id="line-group" ${s.line.group_enabled ? "checked" : ""}> เปิดแจ้งเตือนเข้ากลุ่ม (ตามบทบาทที่ตั้งด้านล่าง)</label>
        <div id="line-groups"></div>
        <div class="field-row">
          <label class="field"><span>เพิ่มกลุ่มด้วย Group ID</span><input id="line-new-id" placeholder="Cxxxxxxxxxxxxxxxx"></label>
          <label class="field"><span>ชื่อเรียก (ภายใน)</span><input id="line-new-label" placeholder="เช่น กลุ่มแอดมินร้าน"></label>
        </div>
        <button type="button" class="btn ghost sm" id="line-add-group">+ เพิ่มกลุ่ม</button>
        <label class="check"><input type="checkbox" id="line-individual" ${s.line.individual_enabled ? "checked" : ""}> แจ้งรายบุคคล (ลูกค้าพิมพ์เลขคำสั่งซื้อทาง OA เพื่อผูก — ผูกแล้ว ${state.lineUsers.length} คน)</label>
        <div class="field-row">
          <label class="field"><span>Channel Access Token ${s.line.has_token ? "(ตั้งค่าแล้ว)" : ""}</span><input type="password" id="line-token" autocomplete="new-password" placeholder="ใส่เฉพาะเมื่อต้องการเปลี่ยน"></label>
          <label class="field"><span>Channel Secret ${s.line.has_secret ? "(ตั้งค่าแล้ว)" : ""}</span><input type="password" id="line-secret" autocomplete="new-password" placeholder="ใส่เฉพาะเมื่อต้องการเปลี่ยน"></label>
        </div>
        <button class="btn primary" id="save-line">บันทึก LINE OA</button>
        <ol class="hint-list">
          <li>ตั้ง Webhook URL = <code>${esc(state.flags.public_url || "https://<โดเมนร้าน>")}/api/line-webhook</code> แล้วเปิดใช้งาน</li>
          <li>ชวนบอทเข้ากลุ่มร้าน → กลุ่มถูกเพิ่มอัตโนมัติ (บทบาท “ทุกอย่าง”)</li>
          <li>บทบาท: “ทุกอย่าง” รับทุกแจ้งเตือน · “ออเดอร์เท่านั้น” รับข่าวออเดอร์ · “การเงินเท่านั้น” รับสรุปยอด</li>
          <li>ลูกค้าพิมพ์เลขคำสั่งซื้อ (BP-XXXXXXXX) ทางแชท OA เพื่อผูกรับแจ้งเตือนส่วนตัว</li>
        </ol>
      </div>

      <div class="card pad settings-card settings-full">
        <h2>🛡 บันทึกการดำเนินการ (Audit Log — ล่าสุด 50 รายการ)</h2>
        <p class="muted sm">เก็บทุกขั้นตอนสำคัญ: เข้าสู่ระบบ (สำเร็จ/ล้มเหลว/ถูกบล็อก), แก้สินค้า/คูปอง/ตั้งค่า, จัดส่ง, การเงิน — เพื่อตรวจสอบย้อนหลังได้</p>
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>เวลา</th><th>การกระทำ</th><th>รายละเอียด</th><th>IP</th></tr></thead>
            <tbody>${state.audit.map((a) => `<tr><td class="mono sm">${fmtDate(a.created_at)}</td><td><code class="audit-code">${esc(a.action)}</code></td><td class="muted sm">${esc(a.detail || "-")}</td><td class="mono sm">${esc(a.ip || "-")}</td></tr>`).join("") || `<tr><td colspan="4" class="muted center">ยังไม่มีบันทึก</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  bindThemeSection();
  bindShippingSection();
  bindEmailSection();
  bindLineSection();
  renderLineGroups();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return "#" + [ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function bindThemeSection() {
  let chosen = { ...state.settings.theme };
  const row = $("#preset-row");
  const updatePreview = () => {
    const prev = $("#theme-preview");
    if (prev) { prev.style.background = chosen.bg; prev.style.color = chosen.brandStrong; prev.style.borderColor = chosen.brand; }
  };
  const renderSwatches = () => {
    row.innerHTML = "";
    for (const [key, p] of Object.entries(PRESETS)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "preset-btn" + (chosen.preset === key ? " active" : "");
      b.textContent = p.name;
      b.style.background = p.bg;
      b.style.color = p.brandStrong;
      b.style.borderColor = p.brand;
      b.addEventListener("click", () => { chosen = { preset: key, ...p }; updatePreview(); renderSwatches(); });
      row.appendChild(b);
    }
  };
  renderSwatches();
  updatePreview();
  $("#custom-brand").addEventListener("input", (e) => {
    const brand = e.target.value;
    chosen = { preset: "custom", bg: chosen.bg, brand, brandStrong: shade(brand, 0.72), accent: shade(brand, 1.25) };
    updatePreview();
    renderSwatches();
  });
  $("#save-theme").addEventListener("click", async () => {
    try {
      await api("/admin-api/settings", { body: { theme: chosen } });
      toast("บันทึกโทนสีร้านแล้ว — หน้าร้านจะใช้สีใหม่ภายในไม่กี่นาที");
    } catch (err) { toast(err.message, true); }
  });
}

function bindShippingSection() {
  $("#save-shipping").addEventListener("click", async () => {
    try {
      await api("/admin-api/settings", {
        body: {
          shipping: {
            provider: $("#ship-provider").value,
            pickup_enabled: $("#ship-pickup").checked,
            pickup_note: $("#ship-pickup-note").value.trim(),
            tracking_url: $("#ship-tracking-url").value.trim(),
          },
        },
      });
      toast("บันทึกระบบขนส่งแล้ว");
    } catch (err) { toast(err.message, true); }
  });
}

function bindEmailSection() {
  $("#save-email").addEventListener("click", async () => {
    try {
      await api("/admin-api/settings", {
        body: { email: { notify_paid: $("#email-paid").checked, notify_shipped: $("#email-shipped").checked } },
      });
      toast("บันทึกการตั้งค่าอีเมลแล้ว");
    } catch (err) { toast(err.message, true); }
  });
}

function renderLineGroups() {
  const holder = $("#line-groups");
  if (!holder) return;
  holder.innerHTML = state.lineGroups.map((g, i) => `
    <div class="group-row">
      <input class="g-label" data-i="${i}" value="${esc(g.label || "")}" placeholder="ชื่อเรียก">
      <input class="g-id mono" data-i="${i}" value="${esc(g.id)}" readonly>
      <select class="g-role" data-i="${i}">
        <option value="all"${g.role === "all" ? " selected" : ""}>ทุกอย่าง</option>
        <option value="orders"${g.role === "orders" ? " selected" : ""}>ออเดอร์เท่านั้น</option>
        <option value="finance"${g.role === "finance" ? " selected" : ""}>การเงินเท่านั้น</option>
      </select>
      <button type="button" class="btn ghost sm" data-action="line-test" data-i="${i}">ทดสอบ</button>
      <button type="button" class="link-btn" data-action="line-del" data-i="${i}">เอาออก</button>
    </div>`).join("") || `<p class="muted sm">ยังไม่มีกลุ่ม — ชวนบอทเข้ากลุ่มร้าน (เพิ่มอัตโนมัติ) หรือเพิ่มด้วย Group ID ด้านล่าง</p>`;
}

function bindLineSection() {
  $("#line-add-group").addEventListener("click", () => {
    const id = $("#line-new-id").value.trim();
    if (!/^(C|U)[0-9a-fA-F]{16,}$/.test(id)) { toast("รูปแบบ ID ไม่ถูกต้อง (เริ่มด้วย C หรือ U ตามด้วยตัวเลขฐานสิบหก)", true); return; }
    if (state.lineGroups.some((g) => g.id === id)) { toast("มีกลุ่มนี้ในรายการแล้ว", true); return; }
    state.lineGroups.push({ id, label: $("#line-new-label").value.trim(), role: "all" });
    $("#line-new-id").value = "";
    $("#line-new-label").value = "";
    renderLineGroups();
  });
  $("#save-line").addEventListener("click", async () => {
    const body = {
      group_enabled: $("#line-group").checked,
      individual_enabled: $("#line-individual").checked,
      groups: state.lineGroups,
    };
    const token = $("#line-token").value.trim();
    const secret = $("#line-secret").value.trim();
    if (token) body.channel_access_token = token;
    if (secret) body.channel_secret = secret;
    try {
      await api("/admin-api/settings", { body: { line: body } });
      toast("บันทึก LINE OA แล้ว");
      loadTab("settings");
    } catch (err) { toast(err.message, true); }
  });
}

/* ════════ การกระทำ (delegation) ════════ */
main.addEventListener("input", (e) => {
  const i = e.target.dataset?.i;
  if (i === undefined || !state.lineGroups) return;
  const idx = Number(i);
  if (!state.lineGroups[idx]) return;
  if (e.target.classList.contains("g-label")) state.lineGroups[idx].label = e.target.value;
  if (e.target.classList.contains("g-role")) state.lineGroups[idx].role = e.target.value;
});

main.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const act = el.dataset.action;

  if (act === "edit") openDialog(state.products.find((p) => p.id === el.dataset.id) || null);
  if (act === "del") {
    if (!confirm("ลบสินค้านี้? (ปิดขายแบบ soft delete — ไม่กระทบออเดอร์เก่า)")) return;
    try { await api(`/admin-api/products/${el.dataset.id}/delete`, { body: {} }); toast("ลบสินค้าแล้ว"); loadTab("products"); }
    catch (err) { toast(err.message, true); }
  }
  if (act === "stock-save") {
    const input = main.querySelector(`[data-stock-input="${el.dataset.id}"]`);
    const cur = state.products.find((p) => p.id === el.dataset.id)?.stock ?? 0;
    const delta = Number(input.value) - cur;
    if (delta === 0) { toast("ไม่มีการเปลี่ยนแปลง"); return; }
    try { await api(`/admin-api/products/${el.dataset.id}/stock`, { body: { delta } }); toast("ปรับสต๊อกแล้ว"); loadTab("products"); }
    catch (err) { toast(err.message, true); }
  }
  if (act === "edit-coupon") openCouponDialog(state.coupons.find((c) => c.id === el.dataset.id) || null);
  if (act === "del-coupon") {
    if (!confirm("ลบคูปองนี้?")) return;
    try { await api(`/admin-api/coupons/${el.dataset.id}/delete`, { body: {} }); toast("ลบคูปองแล้ว"); loadTab("coupons"); }
    catch (err) { toast(err.message, true); }
  }
  if (act === "pickup") {
    try { await api(`/admin-api/orders/${el.dataset.id}/pickup`, { body: {} }); toast("บันทึกการแจ้งเข้ารับพัสดุแล้ว"); loadTab("orders"); }
    catch (err) { toast(err.message, true); }
  }
  if (act === "ship") {
    const input = main.querySelector(`[data-track-input="${el.dataset.id}"]`);
    const providerSel = main.querySelector(`[data-provider-input="${el.dataset.id}"]`);
    try {
      await api(`/admin-api/orders/${el.dataset.id}/ship`, { body: { tracking: String(input.value || "").trim(), provider: providerSel?.value || "" } });
      toast("ยืนยันจัดส่งแล้ว — ระบบส่งอีเมล/LINE แจ้งลูกค้าอัตโนมัติ");
      loadTab("orders");
    } catch (err) { toast(err.message, true); }
  }
  if (act === "print-label") {
    const o = state.orders.find((x) => x.id === el.dataset.id);
    if (o) printLabel(o);
  }
  if (act === "del-tx") {
    if (!confirm("ลบรายการนี้?")) return;
    try { await api(`/admin-api/finance/transactions/${el.dataset.id}/delete`, { body: {} }); toast("ลบรายการแล้ว"); loadTab("finance"); }
    catch (err) { toast(err.message, true); }
  }
  if (act === "print-statement") printYearlyStatement(state.financeData, state.financeYear);
  if (act === "print-quarter") {
    const q = Number(el.dataset.q);
    printQuarterlyStatement(state.financeData, state.financeYear, q);
  }
  if (act === "store-quarter") {
    try {
      await api("/admin-api/finance/reports", { body: { period_type: "quarterly", period: `${state.financeYear}-Q${el.dataset.q}` } });
      toast(`จัดเก็บรายงานไตรมาส ${el.dataset.q} แล้ว`);
      loadTab("finance");
    } catch (err) { toast(err.message, true); }
  }
  if (act === "view-report") {
    try {
      const r = await api(`/admin-api/finance/reports/${el.dataset.id}`);
      showReportDialog(r.report);
    } catch (err) { toast(err.message, true); }
  }
  if (act === "del-report") {
    if (!confirm("ลบรายงานที่จัดเก็บนี้?")) return;
    try { await api(`/admin-api/finance/reports/${el.dataset.id}/delete`, { body: {} }); toast("ลบรายงานแล้ว"); loadTab("finance"); }
    catch (err) { toast(err.message, true); }
  }
  if (act === "line-test") {
    const g = state.lineGroups[Number(el.dataset.i)];
    if (!g) return;
    try { await api("/admin-api/line/test", { body: { group_id: g.id } }); toast(`ส่งข้อความทดสอบเข้า “${g.label || g.id}” แล้ว`); }
    catch (err) { toast(err.message, true); }
  }
  if (act === "line-del") {
    state.lineGroups.splice(Number(el.dataset.i), 1);
    renderLineGroups();
  }
});

/* ════════ ฟอร์มสินค้า ════════ */
const f = document.getElementById("product-form");
const field = (n) => f.elements.namedItem(n);
const typeSelect = field("type");

typeSelect.addEventListener("change", syncTypeUI);
function syncTypeUI() {
  const digital = typeSelect.value === "digital";
  document.querySelectorAll(".phys-only").forEach((n) => n.classList.toggle("hidden", digital));
  document.querySelectorAll(".dig-only").forEach((n) => n.classList.toggle("hidden", !digital));
}

function openDialog(product) {
  state.editingId = product?.id || null;
  f.reset();
  document.getElementById("pf-title").textContent = product ? `แก้ไขสินค้า: ${product.name}` : "เพิ่มสินค้าใหม่";
  document.getElementById("pf-save").textContent = product ? "บันทึกการแก้ไข" : "สร้างสินค้า";
  if (product) {
    field("name").value = product.name;
    field("slug").value = product.slug;
    field("type").value = product.type;
    field("category").value = product.category || "";
    field("price").value = product.price_thb;
    field("compare_at").value = product.compare_at || "";
    field("stock").value = product.stock ?? "";
    field("description").value = product.description || "";
    field("access_url").value = product.access_url || "";
    field("active").checked = Boolean(product.active);
    document.getElementById("pf-file-note").textContent = product.file_key ? "สินค้านี้มีไฟล์ดิจิทัลแนบอยู่ — อัปโหลดไฟล์ใหม่เพื่อแทนที่" : "";
  } else {
    field("active").checked = true;
    document.getElementById("pf-file-note").textContent = "";
  }
  syncTypeUI();
  dialog.showModal();
}

document.getElementById("pf-cancel").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

f.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(f);
  fd.set("active", field("active").checked ? "1" : "0");
  const btn = document.getElementById("pf-save");
  btn.disabled = true; btn.textContent = "กำลังบันทึก…";
  try {
    await api(state.editingId ? `/admin-api/products/${state.editingId}` : "/admin-api/products", { body: fd });
    dialog.close();
    toast("บันทึกสินค้าแล้ว");
    loadTab("products");
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = state.editingId ? "บันทึกการแก้ไข" : "สร้างสินค้า";
  }
});

/* ════════ ฟอร์มคูปอง ════════ */
const cf = document.getElementById("coupon-form");
const cfield = (n) => cf.elements.namedItem(n);
const cfKind = cfield("kind");

cfKind.addEventListener("change", () => {
  document.querySelectorAll(".cf-percent-only").forEach((n) => n.classList.toggle("hidden", cfKind.value !== "percent"));
});

function openCouponDialog(coupon) {
  state.couponEditingId = coupon?.id || null;
  cf.reset();
  document.getElementById("cf-title").textContent = coupon ? `แก้ไขคูปอง: ${coupon.code}` : "เพิ่มคูปองส่วนลด";
  document.getElementById("cf-save").textContent = coupon ? "บันทึกการแก้ไข" : "สร้างคูปอง";
  const toDateString = (ts) => (ts ? new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) : "");
  if (coupon) {
    cfield("code").value = coupon.code;
    cfield("kind").value = coupon.kind;
    cfield("value").value = coupon.value;
    cfield("min_subtotal_thb").value = coupon.min_subtotal_thb || 0;
    cfield("max_discount_thb").value = coupon.max_discount_thb || "";
    cfield("usage_limit").value = coupon.usage_limit || "";
    cfield("starts_at").value = toDateString(coupon.starts_at);
    cfield("ends_at").value = toDateString(coupon.ends_at);
    cfield("active").checked = Boolean(coupon.active);
  } else {
    cfield("min_subtotal_thb").value = "0";
    cfield("active").checked = true;
  }
  cfKind.dispatchEvent(new Event("change"));
  couponDialog.showModal();
}

document.getElementById("cf-cancel").addEventListener("click", () => couponDialog.close());
couponDialog.addEventListener("click", (e) => { if (e.target === couponDialog) couponDialog.close(); });

cf.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    code: cfield("code").value.trim().toUpperCase(),
    kind: cfield("kind").value,
    value: Number(cfield("value").value),
    min_subtotal_thb: Number(cfield("min_subtotal_thb").value || 0),
    max_discount_thb: cfield("max_discount_thb").value,
    usage_limit: cfield("usage_limit").value,
    starts_at: cfield("starts_at").value,
    ends_at: cfield("ends_at").value,
    active: cfield("active").checked,
  };
  const btn = document.getElementById("cf-save");
  btn.disabled = true; btn.textContent = "กำลังบันทึก…";
  try {
    await api(state.couponEditingId ? `/admin-api/coupons/${state.couponEditingId}` : "/admin-api/coupons", { body });
    couponDialog.close();
    toast("บันทึกคูปองแล้ว");
    loadTab("coupons");
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = state.couponEditingId ? "บันทึกการแก้ไข" : "สร้างคูปอง";
  }
});

/* ════════ พิมพ์: ใบปะหน้า / ใบสรุปประจำปี / ใบสรุปไตรมาส ════════ */
function printLabel(o) {
  document.getElementById("print-area").innerHTML = `
    <div class="parcel-label">
      <div class="pl-head"><strong>${esc(SHOP_NAME)}</strong><span>ใบปะหน้าพัสดุ · ${esc(o.number)}</span></div>
      <div class="pl-recv">
        <p class="pl-title">ผู้รับ</p>
        <p class="pl-name">${esc(o.name)}</p>
        <p>โทร ${esc(o.phone)}</p>
        <p>${esc(o.address)} ${esc(o.addr_subdist)} ${esc(o.addr_district)}<br>${esc(o.addr_province)} ${esc(o.addr_postcode)}</p>
      </div>
      <div class="pl-send">
        <p class="pl-title">ผู้ส่ง</p>
        <p>${esc(SHOP_NAME)} — โทร 08x-xxx-xxxx</p>
      </div>
      <div class="pl-meta">
        <p>ขนส่ง: ${esc(o.shipping_provider || state.settings?.shipping?.provider || "-")}${state.settings?.shipping?.pickup_note ? ` · ${esc(state.settings.shipping.pickup_note)}` : ""}</p>
        ${o.tracking_number ? `<p class="pl-tracking">เลขพัสดุ: ${esc(o.tracking_number)}</p>` : ""}
        <p class="sm">รายการ: ${o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(", ")}</p>
      </div>
    </div>`;
  window.print();
}

function printYearlyStatement(data, year) {
  const be = Number(year) + 543;
  const monthRows = (data?.monthly || [])
    .map((m) => `<tr><td>${esc(monthLabel(m.ym))}</td><td class="num">${thb(m.income)}</td><td class="num">${thb(m.expense)}</td><td class="num">${thb(m.income - m.expense)}</td></tr>`)
    .join("");
  const catRows = (data?.expenseCategories || [])
    .map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${thb(c.total)}</td></tr>`)
    .join("");
  const y = data?.yearSummary || { income: 0, expense: 0, profit: 0 };
  document.getElementById("print-area").innerHTML = `
    <div class="statement">
      <h1>ใบสรุปรายรับ – รายจ่าย ประจำปี</h1>
      <p class="sub">ร้าน${esc(SHOP_NAME)} · ปีปฏิทิน ${esc(year)} (พ.ศ. ${be})</p>
      <table>
        <thead><tr><th>เดือน</th><th class="num">รายรับ (บาท)</th><th class="num">รายจ่าย (บาท)</th><th class="num">กำไรสุทธิ (บาท)</th></tr></thead>
        <tbody>${monthRows || `<tr><td colspan="4">ไม่มีข้อมูล</td></tr>`}</tbody>
        <tfoot><tr><td><strong>รวมทั้งปี</strong></td><td class="num"><strong>${thb(y.income)}</strong></td><td class="num"><strong>${thb(y.expense)}</strong></td><td class="num"><strong>${thb(y.profit)}</strong></td></tr></tfoot>
      </table>
      <table>
        <thead><tr><th>รายจ่ายตามหมวดหมู่</th><th class="num">จำนวนเงิน (บาท)</th></tr></thead>
        <tbody>${catRows || `<tr><td colspan="2">ไม่มีข้อมูล</td></tr>`}</tbody>
      </table>
      <p class="fine">เอกสารนี้จัดทำจากระบบบันทึกรายรับ-รายจ่ายของร้าน เพื่อใช้ประกอบการพิจารณาและเตรียมแบบแสดงรายการภาษีเงินได้บุคคลธรรมดา (ภ.ง.ด.90 หรือแบบที่เกี่ยวข้อง) — ตัวเลขและค่าใช้จ่ายที่หักได้จริงควรให้ผู้ทำบัญชี/ที่ปรึกษาภาษีตรวจสอบก่อนยื่นต่อกรมสรรพากร</p>
      <p>จัดทำเมื่อ ${esc(new Date().toLocaleString("th-TH"))}</p>
      <p>ลงชื่อ ________________________ ผู้จัดทำ &nbsp;&nbsp;&nbsp; ( ${esc(SHOP_NAME)} )</p>
    </div>`;
  window.print();
}

function printQuarterlyStatement(data, year, q) {
  const be = Number(year) + 543;
  const qYms = quarterYmList(year, q);
  const months = (data?.monthly || []).filter((m) => qYms.includes(m.ym));
  const qRow = (data?.quarters || []).find((x) => x.q === q) || { income: 0, expense: 0, profit: 0, orders_count: 0, items_count: 0 };
  const monthRows = months.map((m) => `<tr><td>${esc(monthLabel(m.ym))}</td><td class="num">${thb(m.income)}</td><td class="num">${thb(m.expense)}</td><td class="num">${thb(m.income - m.expense)}</td></tr>`).join("") || `<tr><td colspan="4">ไม่มีข้อมูลในไตรมาสนี้</td></tr>`;
  document.getElementById("print-area").innerHTML = `
    <div class="statement">
      <h1>ใบสรุปรายรับ – รายจ่าย รายไตรมาส</h1>
      <p class="sub">ร้าน${esc(SHOP_NAME)} · ไตรมาส ${q} (${QUARTER_RANGE[q]}) ปี ${esc(year)} (พ.ศ. ${be})</p>
      <table>
        <thead><tr><th>เดือน</th><th class="num">รายรับ (บาท)</th><th class="num">รายจ่าย (บาท)</th><th class="num">กำไรสุทธิ (บาท)</th></tr></thead>
        <tbody>${monthRows}</tbody>
        <tfoot><tr><td><strong>รวมไตรมาส ${q}</strong></td><td class="num"><strong>${thb(qRow.income)}</strong></td><td class="num"><strong>${thb(qRow.expense)}</strong></td><td class="num"><strong>${thb(qRow.profit)}</strong></td></tr></tfoot>
      </table>
      <p>จำนวนออเดอร์ที่ชำระเงิน: <strong>${qRow.orders_count}</strong> รายการ · จำนวนสินค้า <strong>${qRow.items_count}</strong> ชิ้น</p>
      <p class="fine">เอกสารนี้จัดทำเพื่อประกอบการยื่นแบบภาษีรายงวด เช่น ภ.ง.ด.30 (ภาษีมูลค่าเพิ่ม — กรณีจดทะเบียน) หรือเตรียมข้อมูล ภ.ง.ด.94 (กึ่งปี) / ภ.ง.ด.90 (รายปี) — ควรให้ผู้ทำบัญชี/ที่ปรึกษาภาษีตรวจสอบก่อนยื่นต่อกรมสรรพากร</p>
      <p>จัดทำเมื่อ ${esc(new Date().toLocaleString("th-TH"))}</p>
      <p>ลงชื่อ ________________________ ผู้จัดทำ &nbsp;&nbsp;&nbsp; ( ${esc(SHOP_NAME)} )</p>
    </div>`;
  window.print();
}
