# ร้านเปรมปรี ศรีนาราง — เว็บขายเสื้อผ้าออนไลน์เต็มรูปแบบ (ธีมสีชาอ่อน)

Cloudflare Pages + Functions + D1 + R2 + Stripe (พร้อมเพย์/บัตร) — หน้าร้านภาษาไทย
รองรับสินค้าจัดส่ง + ดิจิทัล พร้อมระบบหลังบ้าน 6 แท็บ และความปลอดภัยครบทุกขั้นตอน

## ความสามารถ

- **หน้าร้าน**: สินค้า/ค้นหา/หมวด, ตะกร้า, ชำระเงิน (พร้อมเพย์/บัตร + โค้ดส่วนลด), ติดตามออเดอร์+ดาวน์โหลด
- **ปรับโทนสีร้าน** 11 พรีเซ็ต + สีอิสระ จากหน้าตั้งค่า (หน้าร้านเปลี่ยนอัตโนมัติ)
- **คูปอง/ส่วนลด**: ร้อยละ/จำนวนเงิน, ยอดขั้นต่ำ, ส่วนลดสูงสุด, จำกัดครั้ง, ช่วงเวลา
- **อีเมลแจ้งออเดอร์** (Resend): ชำระเงินสำเร็จ (พร้อมลิงก์ดาวน์โหลด) + จัดส่งแล้ว (พร้อมเลขพัสดุ)
- **ขนส่ง**: เลือกผู้ให้บริการ (ไปรษณีย์ไทย/Flash/Kerry/J&T), ปุ่มแจ้งเข้ารับพัสดุ, พิมพ์ใบปะหน้าพัสดุ, ลิงก์ติดตาม
- **LINE OA**: แจ้งเตือน**หลายกลุ่มแบบแยกบทบาท** (ทุกอย่าง / ออเดอร์ / การเงิน) + แจ้งรายบุคคล (ลูกค้าพิมพ์เลขคำสั่งซื้อเพื่อผูก) + ปุ่มทดสอบกลุ่ม + ส่งสรุปยอดวันนี้
- **การเงิน**: รายรับเข้าอัตโนมัติเมื่อจ่าย, รายจ่ายแยกหมวด, สรุปวัน/เดือน/ปี, ส่งออก CSV
- **บันทึกยอดขาย**: ยอดขายรายวัน, สินค้าขายดี (จำนวน/รายรับ)
- **จัดเก็บรายงาน (snapshot)**: รายเดือน/ไตรมาส/ปี — งวดที่จบไปแล้วจัดเก็บอัตโนมัติ, ดูย้อน/CSV/พิมพ์
- **รายงานภาษีรายไตรมาส**: สรุป 4 ไตรมาส + ใบสรุปพิมพ์ได้ (ประกอบ ภ.ง.ด.30/94/90 — ให้ผู้ทำบัญชีตรวจก่อนยื่น)
- **ความปลอดภัย**: rate limit ทุกจุดเสี่ยง, audit log ทุกการดำเนินการ, ตรวจ magic bytes รูป, CSP/HSTS, webhook signature, จองสต๊อก atomic — รายละเอียดทั้งหมดใน `SECURITY.md`

## โครงสร้างไฟล์

```
├─ public/                  หน้าร้าน (SPA) + admin.html + assets/
├─ functions/
│  ├─ api/                  products, checkout(+คูปอง), order, coupon, config,
│  │                        webhook, download/[token], line-webhook
│  ├─ admin-api/            login, products, coupons, orders, pickup, ship,
│  │                        finance (summary/sales/quarterly/reports), settings, audit
│  ├─ media/                [[path]].js (รูปจาก R2)
│  └─ lib/                  http, security(+rateLimit), audit, stripe, orders, settings, notify
├─ schema.sql  seed.sql     ฐานข้อมูล (v3: +rate_limits, audit_log, sales_reports)
├─ wrangler.toml            bindings + ตัวแปรระบบ
├─ _headers                 CSP + HSTS + cache
├─ SECURITY.md              ตรวจสอบความปลอดภัยทุกขั้นตอน
└─ DEPLOYMENT.md            แผน deploy ทีละเฟส + checklist
```

## เริ่มต้น (Local dev)

```bash
npm install -g wrangler && wrangler login
wrangler d1 create shop-db                 # ใส่ database_id ใน wrangler.toml
wrangler r2 bucket create shop-media && wrangler r2 bucket create shop-vault
wrangler d1 execute shop-db --local --file=schema.sql
wrangler d1 execute shop-db --local --file=seed.sql
cp .dev.vars.example .dev.vars             # Stripe / ADMIN_PASSWORD / RESEND_API_KEY
wrangler pages dev public                  # http://localhost:8788
```

ทดสอบ webhook: `stripe listen --forward-to localhost:8788/api/webhook`

## ขึ้น Production

ดูคู่มือละเอียดทีละเฟสใน **DEPLOYMENT.md** สรุป:

```bash
wrangler pages project create premapree-shop
wrangler pages deploy public --project-name premapree-shop
wrangler pages secret put STRIPE_SECRET_KEY --project-name premapree-shop
wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name premapree-shop
wrangler pages secret put ADMIN_PASSWORD --project-name premapree-shop
wrangler pages secret put RESEND_API_KEY --project-name premapree-shop
wrangler pages deploy public --project-name premapree-shop
wrangler d1 execute shop-db --remote --file=schema.sql    # รันได้ซ้ำ (IF NOT EXISTS)
```

## อัปเกรดจากเวอร์ชันเดิม

รัน `schema.sql` ซ้ำ (ปลอดภัย — CREATE IF NOT EXISTS จะเพิ่มตารางใหม่: `rate_limits`, `audit_log`, `sales_reports`)
แล้ว deploy โค้ดใหม่ ระบบจะ migrate `line.group_ids` เดิม → `groups` (role "all") อัตโนมัติ

## ข้อจำกัดที่ควรรู้

- รายงานภาษีเป็นข้อมูลประกอบ — ตรวจกับผู้ทำบัญชีก่อนยื่นจริง
- ค่าธรรมเนียม Stripe กรอกรายจ่ายเอง (หมวด "ค่าธรรมเนียม Stripe")
- ไม่มี Cron — ระบบจัดเก็บรายงานงวดที่จบแล้ว "แบบ lazy" เมื่อเปิดหน้าการเงินครั้งแรกของงวด
- อัปโหลด ≤ 25MB / ไฟล์ใหญ่ใช้ R2 ตรงแล้วกรอกคีย์
- เนื้อหาเงื่อนไข/นโยบายเป็นตัวอย่าง — ให้ผู้เชี่ยวชาญตรวจก่อนใช้จริง
