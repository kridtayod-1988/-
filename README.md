# ร้านเปรมปรี ศรีนาราง — เว็บขายเสื้อผ้าออนไลน์เต็มรูปแบบ

Cloudflare Pages + Pages Functions + D1 + R2 + Stripe Checkout (พร้อมเพย์/บัตร)
รองรับสินค้าจัดส่ง + สินค้าดิจิทัล พร้อมระบบหลังบ้านครบ:

- **ปรับโทนสีร้าน** ได้จากหน้าตั้งค่า (พรีเซ็ต 5 โทน + สีอิสระ) — หน้าร้านเปลี่ยนสีอัตโนมัติ
- **คูปอง/ส่วนลด** ทั้งร้อยละและจำนวนเงิน (จำกัดยอดขั้นต่ำ/จำนวนครั้ง/ช่วงเวลา)
- **อีเมลแจ้งออเดอร์** เมื่อชำระเงินและเมื่อจัดส่ง (ผ่าน Resend)
- **จัดการระบบขนส่ง** เลือกขนส่ง ไปรษณีย์ไทย/Flash/Kerry/J&T + ปุ่ม "แจ้งขนส่งเข้ารับพัสดุ" + พิมพ์ใบปะหน้าพัสดุ
- **LINE OA** แจ้งออเดอร์เข้ากลุ่ม และแจ้งรายบุคคล (ลูกค้าพิมพ์เลขคำสั่งซื้อเพื่อผูก LINE)
- **สมุดรายรับ-รายจ่าย** รายวัน/รายเดือน/รายปี บันทึกรายจ่าย สรุปกำไร พร้อมส่งออก CSV
- **รายงานประจำปี** พิมพ์ใบสรุปรายรับ-รายจ่ายสำหรับประกอบการยื่นภาษีรายปี (ภ.ง.ด.90 และแบบที่เกี่ยวข้อง) — ควรให้ผู้ทำบัญชีตรวจทานก่อนยื่น

## โครงสร้างไฟล์

```
├─ public/                  หน้าร้าน (SPA) + admin.html + assets/
├─ functions/
│  ├─ api/                  products, checkout, order, coupon, webhook,
│  │                        download/[token], config, line-webhook
│  ├─ admin-api/            [[path]].js (login, products, coupons, orders,
│  │                        pickup, ship, finance, settings, line-users)
│  ├─ media/                [[path]].js (รูปสินค้าจาก R2)
│  └─ lib/                  http, security, stripe, orders, settings, notify
├─ schema.sql  seed.sql     ฐานข้อมูล D1
└─ wrangler.toml            bindings + ตัวแปรระบบ
```

## เริ่มต้น (Local dev)

ต้องมี Node 18+, บัญชี Cloudflare, Stripe (บัญชีไทย เพื่อเปิด PromptPay)

```bash
npm install -g wrangler
wrangler login
wrangler d1 create shop-db                 # เอา database_id ไปใส่ wrangler.toml
wrangler r2 bucket create shop-media
wrangler r2 bucket create shop-vault
wrangler d1 execute shop-db --local --file=schema.sql
wrangler d1 execute shop-db --local --file=seed.sql
cp .dev.vars.example .dev.vars             # กรอก Stripe / ADMIN_PASSWORD / RESEND_API_KEY
wrangler pages dev public                  # http://localhost:8788
```

ทดสอบ webhook ในเครื่อง (เทอร์มินัลแยก):
```bash
stripe listen --forward-to localhost:8788/api/webhook
# คัดลอก whsec_... ใส่ .dev.vars (STRIPE_WEBHOOK_SECRET) แล้วรีสตาร์ท
```

บัตรทดสอบ: `4242 4242 4242 4242` (สำเร็จ) / `4000 0000 0000 0002` (ปฏิเสธ)

## ขึ้น Production

```bash
wrangler pages project create premapree-shop
wrangler pages deploy public --project-name premapree-shop
wrangler d1 execute shop-db --remote --file=schema.sql
wrangler pages secret put STRIPE_SECRET_KEY --project-name premapree-shop
wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name premapree-shop
wrangler pages secret put ADMIN_PASSWORD --project-name premapree-shop
wrangler pages secret put RESEND_API_KEY --project-name premapree-shop
wrangler pages deploy public --project-name premapree-shop   # deploy ซ้ำหลังตั้ง secret
```

อย่าลืมแก้ `PUBLIC_URL` ใน wrangler.toml เป็นโดเมนจริง (ใช้สร้างลิงก์ดาวน์โหลดในอีเมล)

### Stripe Dashboard
1. เปิด PromptPay (Settings → Payment methods; บัญชีไทย สกุล THB)
2. Developers → Webhooks → Add endpoint `https://<โดเมน>/api/webhook` เลือกอีเวนต์:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`
3. คัดลอก signing secret → `wrangler pages secret put STRIPE_WEBHOOK_SECRET`

### อีเมลแจ้งออเดอร์ (Resend)
1. สมัคร Resend → ยืนยันโดเมนของร้าน
2. สร้าง API key → ใส่เป็น `RESEND_API_KEY`
3. แก้ `EMAIL_FROM` ใน wrangler.toml เป็นอีเมลโดเมนร้าน เช่น `ร้านเปรมปรี <orders@premapree.com>`

### LINE OA (แจ้งเตือนกลุ่ม + รายบุคคล)
1. ที่ LINE Developers สร้าง Provider + Messaging API channel ใหม่
2. ตั้ง Webhook URL = `https://<โดเมน>/api/line-webhook` แล้วเปิด Use webhook
3. คัดลอก **Channel access token** และ **Channel secret** ไปใส่ในหน้าตั้งค่า → LINE OA
4. แอด OA เป็นเพื่อน และชวนบอทเข้ากลุ่มร้าน — ระบบจะบันทึก group id อัตโนมัติ (เหตุการณ์ joined)
5. เปิดสวิตช์ "แจ้งเข้ากลุ่ม" และ/หรือ "แจ้งรายบุคคล"
6. ลูกค้าพิมพ์เลขคำสั่งซื้อ (เช่น BP-XXXXXXXX) ทางแชท OA เพื่อผูกรับการแจ้งเตือนส่วนตัว

## ใช้งานระบบหลังบ้าน (/admin.html)

- **ภาพรวม**: รายได้ ออเดอร์รอจัดส่ง สต๊อกใกล้หมด
- **สินค้า**: เพิ่ม/แก้ไข (รูป ≤5MB, ไฟล์ดิจิทัล ≤25MB), ปรับสต๊อก (มี audit log), soft delete
- **คูปอง**: สร้างโค้ด ตั้งเปอร์เซ็นต์/จำนวนเงิน ยอดขั้นต่ำ จำกัดครั้ง วันเริ่ม-หมดอายุ
- **คำสั่งซื้อ**: กรองสถานะ, ปุ่มแจ้งขนส่งเข้ารับพัสดุ, ยืนยันจัดส่ง+เลขพัสดุ (ส่งอีเมล/LINE อัตโนมัติ), พิมพ์ใบปะหน้าพัสดุ
- **การเงิน**: รายรับเข้าอัตโนมัติเมื่อออเดอร์ชำระเงิน, บันทึกรายจ่ายรายวัน, สรุปวัน/เดือน/ปี, ส่งออก CSV, พิมพ์ใบสรุปประจำปีสำหรับยื่นภาษี
- **ตั้งค่า**: โทนสีร้าน, ขนส่ง+เข้ารับพัสดุ, อีเมล, LINE OA

## หมายเหตุสำคัญ

- รายงานการเงินและใบสรุปประจำปีเป็น**ข้อมูลประกอบ**การยื่นแบบ ภ.ง.ด.90 (บุคคลธรรมดา) — ตัวเลข ค่าใช้จ่ายที่หักได้จริงและเอกสารแนบ ควรให้ผู้ทำบัญชี/ที่ปรึกษาภาษีตรวจก่อนยื่น
- ค่าธรรมเนียม Stripe ยังไม่ถูกบันทึกเป็นรายจ่ายอัตโนมัติ — กรอกเองในหมวด "ค่าธรรมเนียม Stripe" ตามใบแจ้งหนี้
- เนื้อหาเงื่อนไข/นโยบายความเป็นส่วนตัวเป็นตัวอย่าง — ให้ผู้เชี่ยวชาญตรวจก่อนใช้จริง
- อัปโหลดผ่านแผงผู้ดูแลจำกัด 25MB (ไฟล์ใหญ่อัปโหลดขึ้น R2 เองแล้วกรอกคีย์)
- Stripe THB ขั้นต่ำ 10 บาท/ออเดอร์ (ตั้งใน MIN_ORDER_THB)

## อัปเกรดจากเวอร์ชันเก่า (ถ้ามีฐานข้อมูลเดิม)

```sql
ALTER TABLE orders ADD COLUMN discount_thb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN coupon_code TEXT;
ALTER TABLE orders ADD COLUMN coupon_id TEXT;
ALTER TABLE orders ADD COLUMN shipping_provider TEXT;
ALTER TABLE orders ADD COLUMN pickup_status TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN pickup_at INTEGER;
```
แล้วรันส่วน CREATE TABLE ของ `coupons`, `settings`, `transactions`, `line_users` จาก schema.sql
