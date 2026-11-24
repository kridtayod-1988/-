-- สินค้าตัวอย่าง (แก้/ลบได้ผ่าน /admin.html) — รูปจะแสดงเป็นตัวอักษรจนกว่าจะอัปโหลดรูปจริง
INSERT INTO products
  (id, slug, name, type, category, description, price_thb, compare_at, stock, image_key, file_key, file_name, access_url, active, deleted, created_at, updated_at)
VALUES
 ('p01','organic-cotton-tee','เสื้อยืดคอกลมออร์แกนิค','physical','เสื้อยืด','เสื้อยืดผ้าคอตตอนออร์แกนิค 200 แกรม นุ่ม ระบายอากาศดี ทรงพอดีตัว ซักแล้วไม่ย้วย มี 4 สี: ครีม ชา น้ำตาลเข้ม ดำ (ไซซ์ S–XL)',390,490,24,NULL,NULL,NULL,NULL,1,0,(CAST(strftime('%s','now') AS INTEGER)*1000),(CAST(strftime('%s','now') AS INTEGER)*1000)),
 ('p02','linen-shirt-natural','เสื้อเชิ้ตลินินแขนยาว','physical','เสื้อเชิ้ต','เสื้อเชิ้ตลินินฝ้ายเนื้อบางเบา กระดุมไม้ ใส่ได้ทั้งทำงานและทริปทะเล สีธรรมชาติ (ไซซ์ S–XL)',790,NULL,12,NULL,NULL,NULL,NULL,1,0,(CAST(strftime('%s','now') AS INTEGER)*1000),(CAST(strftime('%s','now') AS INTEGER)*1000)),
 ('p03','relaxed-denim-pants','กางเกงยีนส์ทรงหลวมเอวสูง','physical','กางเกง','ยีนส์เนื้อหนังสต็อก ทรงหลวมตรง เอวสูง กระเป๋าข้างใหญ่ สีคงเดิมหลังซัก (ไซซ์ 28–36)',1190,1390,8,NULL,NULL,NULL,NULL,1,0,(CAST(strftime('%s','now') AS INTEGER)*1000),(CAST(strftime('%s','now') AS INTEGER)*1000)),
 ('p04','pleated-linen-skirt','กระโปรงลินินพลีทยาว','physical','กระโปรง','พลีทถี่ยาวคลุมข้อเท้า เอวยางยืดใส่สบาย สีชาอ่อน (ฟรีไซซ์)',890,NULL,15,NULL,NULL,NULL,NULL,1,0,(CAST(strftime('%s','now') AS INTEGER)*1000),(CAST(strftime('%s','now') AS INTEGER)*1000)),
 ('p05','knit-vest-cream','เสื้อกั๊กไหมพรมสีครีม','physical','เสื้อยืด','ถักลายตะเข็บเล็ก ใส่คู่กับเชิ้ตหรือทีเชิ้ต สีครีมนุ่มตา (ไซซ์ S–L) — ตัวอย่างสินค้าหมดสต๊อก',590,NULL,0,NULL,NULL,NULL,NULL,1,0,(CAST(strftime('%s','now') AS INTEGER)*1000),(CAST(strftime('%s','now') AS INTEGER)*1000)),
 ('p06','linen-shirt-dress','เดรสลินินทรงหลวม','physical','เดรส','เดรสลินินเอวสายรัด ยาวหน้าเข่า มีกระเป๋าข้าง สีน้ำตาลอ่อน (ไซซ์ S–XL)',1290,NULL,10,NULL,NULL,NULL,NULL,1,0,(CAST(strftime('%s','now') AS INTEGER)*1000),(CAST(strftime('%s','now') AS INTEGER)*1000)),
 ('p07','minimal-style-ebook','E-Book สูตรแต่งตัวมินิมอล (PDF)','digital','อีบุ๊ก','ไฟล์ PDF 52 หน้า: สูตรจับคู่เสื้อผ้าเบสิก 12 ลุกค์ พร้อมเช็กลิสต์แคปซูลวอร์ดรอบ — ดาวน์โหลดทันทีหลังชำระเงิน (อัปโหลดไฟล์จริงผ่าน /admin.html ก่อนเปิดขาย)',149,NULL,NULL,NULL,NULL,NULL,NULL,1,0,(CAST(strftime('%s','now') AS INTEGER)*1000),(CAST(strftime('%s','now') AS INTEGER)*1000));

-- คูปองตัวอย่าง: PREM10 = ลด 10% สูงสุด 200 บาท
INSERT INTO coupons
  (id, code, kind, value, min_subtotal_thb, max_discount_thb, usage_limit, used_count, starts_at, ends_at, active, deleted, created_at, updated_at)
VALUES
 ('c01','PREM10','percent',10,0,200,100,0,NULL,NULL,1,0,(CAST(strftime('%s','now') AS INTEGER)*1000),(CAST(strftime('%s','now') AS INTEGER)*1000));
