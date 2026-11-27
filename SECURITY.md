# 🔒 ความปลอดภัยไซเบอร์ — ตรวจสอบทุกขั้นตอนการดำเนินการ (ร้านเปรมปรี ศรีนาราง)

เอกสารนี้สรุปการตรวจสอบและมาตรการป้องกันที่ **ติดตั้งอยู่ในโค้ดจริง** ครบทุกขั้นตอน พร้อมข้อจำกัด
และสิ่งที่แนะนำเพิ่มระดับ Cloudflare Dashboard (ใช้ปุ่มคลิก ไม่ต้องเขียนโค้ด)

## 1) โครงสร้างความปลอดภัยพื้นฐาน (ทุกคำขอ)

| มาตรการ | ที่ใช้งาน |
|---|---|
| HTTPS บังคับ + HTTP/2/3 | Cloudflare Pages บังคับอัตโนมัติ |
| HSTS (180 วัน) | `_headers` |
| Content-Security-Policy เข้ม: script จาก self เท่านั้น ห้าม inline script | `_headers` |
| frame-ancestors 'none' (กัน clickjacking), object-src 'none' | `_headers` |
| X-Content-Type-Options: nosniff | `_headers` |
| Referrer-Policy: strict-origin-when-cross-origin | `_headers` |
| Permissions-Policy ปิดกล้อง/ไมค์/ตำแหน่ง | `_headers` |
| ไม่มี CORS header เปิดให้โดเมนอื่น — cross-origin อ่านข้อมูลไม่ได้ | ทุก endpoint |
| พารามิเตอร์ SQL ทั้งหมด bind แบบ parameterized (กัน SQL injection) | ทุก query ใน D1 |
| escape HTML ทุกจุดแสดงผลข้อมูลผู้ใช้ (กัน XSS) | core.js `esc()` + ทุก template |

## 2) การเข้าสู่ระบบผู้ดูแล (`/admin.html`, `/admin-api/login`)

- รหัสผ่าน ≥ 12 ตัวอักษร **บังคับ** ระบบปฏิเสธถ้าสั้นกว่านี้ (`login`)
- เทียบรหัสแบบ SHA-256 + constant-time compare (ไม่รั่วข้อมูลจากจังหวะเวลา)
- **Rate limit 5 ครั้ง / 15 นาที / IP** — เกินจะถูกบล็อกชั่วคราว + บันทึก `login_blocked`
- หน่วงเวลา 500ms เมื่อรหัสผิด (ทำ brute force ช้าลง)
- เซสชันคุกกี้ `HttpOnly; Secure; SameSite=Strict` เซ็น HMAC-SHA256 อายุ 8 ชั่วโมง — แก้ไข/ปลอมไม่ได้
- **Origin check** ทุกคำขอ POST ของ admin — ป้องกัน CSRF
- **Audit log** ทุกครั้ง: `login_success` / `login_failed` / `login_blocked` / `logout` (พร้อม IP, เวลา)
- ✅ แนะนำเพิ่ม: **Cloudflare Access** ครอบ `/admin.html*` และ `/admin-api*` (SSO/OTP ของ Cloudflare) และ WAF Rate Limiting rule ระดับ edge

## 3) การสั่งซื้อ/ชำระเงิน (`/api/checkout`)

- **Rate limit 20 ครั้ง / ชั่วโมง / IP** — กันสแปมออเดอร์และการบังคับสร้าง Stripe coupon
- ราคา/สต๊อก/ส่วนลด **คำนวณใหม่ที่เซิร์ฟเวอร์เสมอ** — ลูกค้าแก้ราคาทางฝั่งไคลเอนต์ไม่ได้
- จองสต๊อกแบบ atomic transaction + `CHECK (stock >= 0)` — กันขายเกิน (race condition)
- จำกัด 20 รายการ/บิล, 10 ชิ้น/รายการ, ตรวจรูปแบบอีเมล/เบอร์/รหัสไปรษณีย์
- ข้อมูลบัตร/พร้อมเพย์ **ไม่ผ่านเซิร์ฟเวอร์เราเลย** — อยู่ในหน้า hosted ของ Stripe (ขอบเขต PCI เล็กสุด)
- ตรวจยอด+สกุลเงินก่อนมาร์คจ่าย (`amount_total === total*100 && currency === 'thb'`)

## 4) Webhooks (Stripe + LINE)

- Stripe: ตรวจลายเซ็น HMAC-SHA256 + timestamp ±5 นาที (กัน replay) แบบ constant-time
- LINE: ตรวจ X-Line-Signature HMAC base64 กับ Channel secret
- ประมวลผลซ้ำได้ปลอดภัย (idempotent): มาร์คจ่าย/คืนสต๊อก/ออกโทเคน/บันทึกรายรับ มีเงื่อนไขกันซ้ำทุกขั้น

## 5) ดาวน์โหลดสินค้าดิจิทัล (`/api/download/:token`)

- โทเคนสุ่ม 256-bit ต่อรายการ (เดาไม่ได้)
- ตรวจ 3 ชั้น: สถานะออเดอร์ต้อง paid/shipped, ไม่หมดอายุ, ไม่เกินจำนวนครั้ง — เพิ่มจำนวนแบบ conditional update (กันแซง)
- ไฟล์เก็บใน R2 bucket **VAULT แยกจากรูปสินค้า** (bug ใน media route ไม่สามารถปล่อยไฟล์ขายได้)
- filename sanitize + RFC 5987 encoding

## 6) การอัปโหลด (รูปสินค้า / ไฟล์ดิจิทัล — เฉพาะแอดมิน)

- **ตรวจ magic bytes จริง** (JPEG/PNG/WEBP) ไม่เชื่อ MIME ที่ผู้ส่งอ้าง — กันอัปโหลดไฟล์แปลงปลอม
- จำกัดขนาด: รูป 5MB, ไฟล์ดิจิทัล 25MB
- ชื่อไฟล์เก็บเป็น UUID ที่ระบบสร้างเอง (ไม่ใช้ชื่อจากผู้ใช้ → กัน path traversal)
- เสิร์ฟผ่าน `/media` ตรวจ prefix `p/` + รูปแบบคีย์เข้ม + Cache immutable

## 7) คูปอง (`/api/coupon`)

- **Rate limit 30 ครั้ง / 10 นาที / IP** — กันเดาโค้ด
- คูปองถูกนับเมื่อสร้างเซสชันสำเร็จ และ**คืนสิทธิ์อัตโนมัติ**เมื่อออเดอร์ยกเลิก/หมดเวลา (ป้องกันการล็อกสิทธิ์)

## 8) ติดตามคำสั่งซื้อ (`/api/order` POST)

- **Rate limit 10 ครั้ง / 10 นาที / IP** — กันเดาคู่ (เลขออเดอร์ + อีเมล)
- ต้องรู้ทั้งเลขออเดอร์และอีเมลของเจ้าของจึงจะเห็นข้อมูล

## 9) ระบบหลังบ้าน (products / coupons / orders / finance / settings)

- ทุก endpoint ต้องมีเซสชันที่ถูกต้อง (ตรวจ HMAC cookie ทุกครั้ง)
- ทุกการเปลี่ยนข้อมูล **เขียน Audit Log** (`product_*`, `coupon_*`, `settings_update`, `order_ship`, `order_pickup`, `tx_*`, `report_*`, `notify_today`, `line_test`, `finance_export`) พร้อม IP + เวลา — ดูย้อนได้ที่ แท็บตั้งค่า
- token/secret ของ LINE **ไม่ส่งกลับ**ไปยังหน้าเว็บ (ปกปิดเป็น `has_token/has_secret`)
- ลบรายการบัญชีที่มาจากออเดอร์ **ไม่ได้** (ป้องกันการลบหลักฐาน)

## 10) ข้อมูลส่วนบุคคล (PDPA)

- เก็บเฉพาะชื่อ/อีเมล/เบอร์/ที่อยู่ เพื่อจัดส่งเท่านั้น + มี checkbox ยินยอมบนหน้าชำระเงิน
- แนะนำ: กำหนดรอบลบข้อมูลเก่า (เช่น 2 ปี) และแจ้งในนโยบายความเป็นส่วนตัว

## 11) ตาราง Rate Limit สรุป

| Endpoint | จำกัด | หน้าต่างเวลา |
|---|---|---|
| `/admin-api/login` | 5 ครั้ง/IP | 15 นาที |
| `/api/checkout` | 20 ครั้ง/IP | 1 ชั่วโมง |
| `/api/coupon` | 30 ครั้ง/IP | 10 นาที |
| `/api/order` (POST) | 10 ครั้ง/IP | 10 นาที |

> Rate limiter ทำงานบน D1 เป็นแนวแรก — ควรเสริม **WAF Rate Limiting Rule ของ Cloudflare** เพื่อบล็อกที่ edge ก่อนถึงแอป

## 12) สิ่งที่แนะนำตั้งค่าเพิ่ม (ไม่ต้องแก้โค้ด)

1. **Cloudflare Access** — ครอบ `/admin.html*` + `/admin-api*` (OTP/SSO ก่อนถึงหน้าล็อกอิน)
2. **WAF Rate Limiting Rule** — เช่น limit `/admin-api/login` ที่ 10 req/นาที/IP ระดับ edge
3. **Cloudflare Turnstile** — ใส่ CAPTCHA ฟรีบนหน้าชำระเงิน (เพิ่มภายหลังได้)
4. **D1 Time Travel + สำรองข้อมูล** — กู้คืนย้อน 30 วันได้ในแผน paid
5. **R2 Object Versioning** — กันลบ/ทำลายไฟล์โดยบังเอิญ
6. หมุนเวียนคีย์: เปลี่ยน `ADMIN_PASSWORD`, `STRIPE_SECRET_KEY`, token LINE เมื่อมีปัญหาหรือทุก 6–12 เดือน
7. ใช้เครื่อง/เบราว์เซอร์ที่ปลอดภัยเข้าแผงผู้ดูแล และออกจากระบบเมื่อใช้เสร็จ

## 13) เมื่อเกิดเหตุการณ์ (Incident Response แบบย่อ)

1. เปลี่ยน `ADMIN_PASSWORD` ทันที (เซสชันเก่าจะใช้ไม่ได้ทันที)
2. หมุนเวียน `STRIPE_SECRET_KEY` ใน Stripe Dashboard และอัปเดต secret
3. ตรวจ `audit_log` + `transactions` + `orders` หารายการผิดปกติ
4. ถ้าสงสัยไฟล์อัปโหลด: ลบ object ใน R2 (MEDIA/VAULT) ที่ต้องสงสัย
5. ใช้ D1 Time Travel กู้คืนข้อมูลถ้าจำเป็น
