# 🚀 แผน Deploy — ร้านเปรมปรี ศรีนาราง (Cloudflare Pages)

แผนทีละเฟส พร้อม checklist ตรวจรับ — ใช้เวลารวม ~1 ชั่วโมงสำหรับครั้งแรก

## เฟส 0 — เตรียมของ (15 นาที)

- [ ] บัญชี Cloudflare (ฟรีก็พอสำหรับเริ่ม)
- [ ] บัญชี **Stripe** แบบไทย (เพื่อเปิด PromptPay) — เตรียมเอกสารยืนยันตัวตน
- [ ] บัญชี **Resend** (สำหรับอีเมล) + โดเมนที่จะใช้ส่งอีเมล
- [ ] **LINE OA** แบบ Messaging API (สร้างที่ LINE Developers Console)
- [ ] โดเมน (แนะนำผูกโดเมนจริงกับ Pages ภายหลัง)
- [ ] Node 18+ และ `npm i -g wrangler` + `wrangler login`

## เฟส 1 — สร้างทรัพยากร Cloudflare (10 นาที)

```bash
wrangler d1 create shop-db                    # → เอา database_id ไปใส่ wrangler.toml
wrangler r2 bucket create shop-media          # รูปสินค้า
wrangler r2 bucket create shop-vault          # ไฟล์ดิจิทัล (ตู้เซฟ)
wrangler d1 execute shop-db --remote --file=schema.sql   # รันได้ซ้ำ ปลอดภัย
wrangler d1 execute shop-db --remote --file=seed.sql     # ถ้าต้องการสินค้าตัวอย่าง
```

- [ ] `database_id` ใส่ใน wrangler.toml แล้ว
- [ ] แก้ `PUBLIC_URL` เป็น URL ที่จะใช้จริง (สร้างลิงก์ในอีเมล)
- [ ] แก้ `EMAIL_FROM` เป็นอีเมลโดเมนร้าน

## เฟส 2 — Deploy ครั้งแรก (10 นาที)

เลือก 1 จาก 2 วิธี:

**วิธี A — เชื่อม Git (แนะนำ):** Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → เลือก repo `E-commerce` → Framework: None → Output: `public` → Deploy (ทุก push จะ deploy อัตโนมัติ)

**วิธี B — Wrangler:**
```bash
wrangler pages project create premapree-shop
wrangler pages deploy public --project-name premapree-shop
```

จากนั้นตั้งความลับ (ต้อง deploy ซ้ำหลังตั้งเสร็จ):
```bash
wrangler pages secret put STRIPE_SECRET_KEY --project-name premapree-shop
wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name premapree-shop
wrangler pages secret put ADMIN_PASSWORD --project-name premapree-shop
wrangler pages secret put RESEND_API_KEY --project-name premapree-shop
wrangler pages deploy public --project-name premapree-shop
```

- [ ] หน้าร้านเปิดได้, `/admin.html` ล็อกอินได้

## เฟส 3 — ฐานข้อมูล Production ตรวจ (5 นาที)

- [ ] ตารางครบ (products, coupons, orders, transactions, sales_reports, audit_log, …) — รัน `schema.sql` แล้ว IF NOT EXISTS จะเพิ่มเฉพาะของใหม่
- [ ] เข้า `/admin.html` → สินค้า → อัปโหลดรูปจริงทดสอบ 1 ชิ้น

## เฟส 4 — Stripe (10 นาที)

- [ ] Dashboard → Payment methods → เปิด **PromptPay** (บัญชีไทย/THB)
- [ ] Developers → Webhooks → Add endpoint `https://<โดเมน>/api/webhook`
      เลือกอีเวนต์: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
      `checkout.session.async_payment_failed`, `checkout.session.expired`
- [ ] คัดลอก Signing secret → `wrangler pages secret put STRIPE_WEBHOOK_SECRET ...` + deploy ซ้ำ
- [ ] ทดสอบโหมด test: สั่งซื้อจริง 1 ออเดอร์ด้วยบัตร `4242 4242 4242 4242` → ออเดอร์ขึ้น "ชำระแล้ว" และรายรับเข้าสมุดการเงิน

## เฟส 5 — LINE OA (10 นาที)

- [ ] LINE Developers → Messaging API channel → เอา **Channel access token** + **Channel secret**
- [ ] เสียบทั้งสองค่าที่ `/admin.html` → ตั้งค่า → LINE OA → บันทึก
- [ ] ตั้ง Webhook URL = `https://<โดเมน>/api/line-webhook` + เปิด Use webhook + Verify ผ่าน
- [ ] ชวนบอทเข้ากลุ่มร้าน → กลุ่มโผล่ในรายการอัตโนมัติ → กด "ทดสอบ" ต่อกลุ่ม
- [ ] ตั้งบทบาทกลุ่ม: ทุกอย่าง / ออเดอร์เท่านั้น / การเงินเท่านั้น → บันทึก

## เฟส 6 — อีเมล Resend (5 นาที)

- [ ] Resend → Domains → เพิ่มโดเมน + ตั้งค่า DNS record ตามที่ขอ
- [ ] สร้าง API key → ใส่เป็น secret `RESEND_API_KEY`
- [ ] ตรวจ `EMAIL_FROM` ใน wrangler.toml ใช้โดเมนเดียวกัน → deploy ซ้ำ
- [ ] สั่งซื้อทดสอบ 1 ออเดอร์ → ได้รับอีเมลยืนยัน

## เฟส 7 — โดเมน + ความปลอดภัยระดับ Cloudflare (10 นาที)

- [ ] Pages project → Custom domains → เพิ่มโดเมนร้าน
- [ ] (แนะนำ) **Cloudflare Access** ครอบ `/admin.html*` และ `/admin-api*`
- [ ] (แนะนำ) **WAF Rate Limiting rule** สำหรับ `/api/*` และ `/admin-api/login`
- [ ] (แนะนำ) เปิด D1 Time Travel + R2 Versioning ถ้าใช้แผน paid
- [ ] (แนะนำ) Security → Settings ตรวจว่า TLS ≥ 1.2, Always Use HTTPS เปิด

## เฟส 8 — ทดสอบหลัง Deploy (checklist ตรวจรับ)

- [ ] หน้าแรก/สินค้า/ตะกร้า/ชำระเงิน ใช้งานได้ครบ
- [ ] จ่ายจริง 1 ออเดอร์ → สถานะเปลี่ยน + อีเมล + LINE กลุ่ม + รายรับเข้าสมุด
- [ ] จัดส่ง + เลขพัสดุ → อีเมล/LINE แจ้งลูกค้า + ส่งฟรีคำนวณถูก
- [ ] คูปองใช้ได้ และจำกัดยอด/จำนวนครั้งทำงาน
- [ ] ลูกค้าพิมพ์เลขคำสั่งซื้อทาง OA → ผูกสำเร็จ (แจ้งรายบุคคลทำงาน)
- [ ] จัดเก็บรายงาน + พิมพ์ใบสรุปไตรมาส/ปี ได้
- [ ] audit log มีรายการเคลื่อนไหวตามที่ทดสอบ

## เฟส 9 — หลังเปิดขาย (ดูแลต่อเนื่อง)

| งาน | ความถี่ |
|---|---|
| ตรวจ Audit Log ผิดปกติ (login_failed/block ถี่) | สัปดาห์ละครั้ง |
| ตรวจรายรับ-รายจ่าย + จัดเก็บรายงานงวด | สิ้นเดือน/ไตรมาส |
| หมุนเวียนคีย์ (Stripe/LINE/รหัสผ่าน) | 6–12 เดือน |
| สำรองข้อมูล (D1 export / Time Travel snapshot) | เดือนละครั้ง |
| อัปเดต wrangler/dependency | ตามประกาศ Cloudflare |

## Rollback (ถ้ามีปัญหาหลัง deploy)

1. Pages → Deployments → เลือกเวอร์ชันก่อนหน้า → **Rollback** (ทันที ไม่กระทบฐานข้อมูล)
2. ปัญหาข้อมูล: ใช้ D1 Time Travel กู้ย้อน ตามจุดเวลา
3. ปิดขายชั่วคราว: ปิดสวิตช์ "เปิดขาย" ของสินค้าที่มีปัญหา หรือปรับ `active=0`

## ต้นทุนโดยประมาณ (เริ่มต้น)

- Cloudflare Free: รองรับร้านเริ่มต้นได้สบาย (Pages/Functions/D1/R2 มีโควตาฟรีรายวัน)
- เมื่อทราฟฟิกโต: Workers Paid ~$5/เดือน (โควตาสูงขึ้น + D1 Time Travel เต็มรูปแบบ)
- Stripe: คิดต่อธุรกรรม (บัตร ~3.65%+฿11, PromptPay ~0.25% — ตรวจราคาล่าสุดที่ Stripe)
- Resend: ฟรี 100 อีเมล/วัน — พอสำหรับเริ่มต้น
