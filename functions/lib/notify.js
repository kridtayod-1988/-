// ระบบแจ้งเตือน: อีเมล (Resend) + LINE OA (กลุ่มแอดมินหลายกลุ่มแบบแยกบทบาท / รายบุคคล)
import { orderView } from "./orders.js";
import { getSettings } from "./settings.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const thbFmt = (n) => "฿" + Number(n || 0).toLocaleString("th-TH");
const base = (env) => String(env.PUBLIC_URL || "").replace(/\/$/, "");

export async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "Premapree Shop <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pushLineText(env, to, text) {
  if (!to) return false;
  const settings = await getSettings(env);
  const token = settings?.line?.channel_access_token;
  if (!token) return false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ to, messages: [{ type: "text", text: String(text).slice(0, 4800) }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// เลือกกลุ่มตามบทบาท — role: 'orders' (ออเดอร์) | 'finance' (การเงิน)
// กลุ่มที่ตั้ง role = 'all' จะได้รับทุกประเภท
function groupTargets(settings, role) {
  const groups = Array.isArray(settings.line?.groups) ? settings.line.groups : [];
  return groups.filter((g) => g?.id && (g.role === role || g.role === "all")).map((g) => g.id);
}

function orderText(view) {
  const lines = view.items.map((i) => `• ${i.name} × ${i.qty} = ${thbFmt(i.price * i.qty)}`);
  const totals = [`ยอดสินค้า: ${thbFmt(view.subtotal_thb)}`];
  if (view.shipping_thb) totals.push(`ค่าจัดส่ง: ${thbFmt(view.shipping_thb)}`);
  if (view.discount_thb) totals.push(`ส่วนลด: -${thbFmt(view.discount_thb)}`);
  totals.push(`รวมสุทธิ: ${thbFmt(view.total_thb)}`);
  return `เลขที่ ${view.number}\n${lines.join("\n")}\n${totals.join("\n")}`;
}

async function notifyLine(env, order, customerText, groupText, role = "orders") {
  const settings = await getSettings(env);
  if (settings.line?.group_enabled) {
    for (const gid of groupTargets(settings, role)) {
      await pushLineText(env, gid, groupText);
    }
  }
  if (settings.line?.individual_enabled) {
    const lu = await env.DB.prepare(`SELECT line_user_id FROM line_users WHERE lower(bound_email) = lower(?1)`).bind(order.email).first();
    if (lu) await pushLineText(env, lu.line_user_id, customerText);
  }
}

export async function notifyOrderPaid(env, orderId) {
  const order = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(orderId).first();
  if (!order) return;
  const view = await orderView(env, order);
  const settings = await getSettings(env);

  if (settings.email?.notify_paid !== false) {
    const dl = view.items.filter((i) => i.download_url)
      .map((i) => `<li>${esc(i.name)}: <a href="${base(env)}${esc(i.download_url)}">ดาวน์โหลดที่นี่</a> (เหลือ ${i.downloads_left ?? 0} ครั้ง)</li>`).join("");
    const rows = view.items.map((i) => `<tr><td>${esc(i.name)} × ${i.qty}</td><td style="text-align:right">${thbFmt(i.price * i.qty)}</td></tr>`).join("");
    const discountRow = view.discount_thb
      ? `<tr><td style="text-align:right">ส่วนลด (${esc(view.coupon_code || "")})</td><td style="text-align:right">-${thbFmt(view.discount_thb)}</td></tr>` : "";
    const html = `<div style="font-family:'IBM Plex Sans Thai',sans-serif;color:#453827;max-width:560px;line-height:1.7">
      <h2 style="color:#7c5836;margin:0 0 6px">ขอบคุณสำหรับคำสั่งซื้อ 🙏</h2>
      <p>เลขที่คำสั่งซื้อ <strong>${esc(view.number)}</strong> — ได้รับชำระเงินเรียบร้อยแล้ว</p>
      <table style="width:100%;border-collapse:collapse">${rows}
        ${discountRow}
        <tr><td style="text-align:right"><strong>รวมสุทธิ</strong></td><td style="text-align:right"><strong>${thbFmt(view.total_thb)}</strong></td></tr>
      </table>
      ${dl ? `<h3>ลิงก์ดาวน์โหลดสินค้าดิจิทัล</h3><ul>${dl}</ul>` : ""}
      <p style="color:#85715a;font-size:13px">หากมีข้อสอบถาม ตอบกลับอีเมลนี้ได้เลยค่ะ — ร้านเปรมปรี ศรีนาราง</p>
    </div>`;
    await sendEmail(env, order.email, `ได้รับชำระเงินแล้ว — คำสั่งซื้อ ${view.number}`, html);
  }

  const text = `✅ ออเดอร์ชำระเงินแล้ว\n${orderText(view)}\nลูกค้า: ${view.name}${view.phone ? ` (${view.phone})` : ""}`;
  await notifyLine(env, order, `ขอบคุณที่ชำระเงินค่ะ 🙏\n${orderText(view)}`, text, "orders");
}

export async function notifyOrderShipped(env, orderId) {
  const order = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(orderId).first();
  if (!order || !order.tracking_number) return;
  const view = await orderView(env, order);
  const settings = await getSettings(env);
  const trackingUrl = (settings.shipping?.tracking_url || "").replace("{tracking}", encodeURIComponent(order.tracking_number));
  const provider = order.shipping_provider || settings.shipping?.provider || "";

  if (settings.email?.notify_shipped !== false) {
    const html = `<div style="font-family:'IBM Plex Sans Thai',sans-serif;color:#453827;line-height:1.7">
      <h2 style="color:#7c5836;margin:0 0 6px">พัสดุออกแล้ว 📦</h2>
      <p>คำสั่งซื้อ <strong>${esc(view.number)}</strong> จัดส่งแล้ว${provider ? `ผ่าน ${esc(provider)}` : ""}</p>
      <p>เลขพัสดุ: <strong style="font-size:18px">${esc(order.tracking_number)}</strong></p>
      ${trackingUrl ? `<p><a href="${esc(trackingUrl)}">ติดตามสถานะพัสดุได้ที่นี่</a></p>` : ""}
      <p style="color:#85715a;font-size:13px">ขอบคุณที่อุดหนุนร้านเปรมปรี ศรีนารางค่ะ 🙏</p>
    </div>`;
    await sendEmail(env, order.email, `จัดส่งแล้ว — คำสั่งซื้อ ${view.number}`, html);
  }

  const customerText = `พัสดุของคุณจัดส่งแล้วค่ะ 📦\nคำสั่งซื้อ ${view.number}\nขนส่ง: ${provider || "-"} · เลขพัสดุ: ${order.tracking_number}${trackingUrl ? `\nติดตาม: ${trackingUrl}` : ""}`;
  const groupText = `📦 จัดส่งแล้ว ${view.number}\nขนส่ง: ${provider || "-"} · เลขพัสดุ: ${order.tracking_number}${trackingUrl ? `\nติดตาม: ${trackingUrl}` : ""}`;
  await notifyLine(env, order, customerText, groupText, "orders");
}

// สรุปการเงิน/ข้อความทั่วไป → ส่งเข้ากลุ่มบทบาท 'finance' + 'all'
export async function notifyFinance(env, text) {
  const settings = await getSettings(env);
  if (!settings.line?.channel_access_token) return 0;
  const targets = [...new Set(groupTargets(settings, "finance"))];
  let sent = 0;
  for (const t of targets) {
    if (await pushLineText(env, t, text)) sent++;
  }
  return sent;
}
