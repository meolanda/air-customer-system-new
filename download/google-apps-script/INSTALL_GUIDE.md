# 🚀 คู่มือติดตั้งระบบรับงานบริการแอร์ (Google Apps Script)

## ✨ ข้อดีของระบบนี้

| ข้อดี | รายละเอียด |
|------|-----------|
| ✅ ฟรี 100% | ไม่มีค่าใช้จ่าย |
| ✅ ไม่ต้องมี Server | รันบน Google โดยตรง |
| ✅ ข้อมูลซิงค์ Real-time | ทุกคนเห็นข้อมูลเดียวกัน |
| ✅ เก็บรูปได้ | อัปโหลดไป Google Drive อัตโนมัติ |
| ✅ เข้าใช้ได้ทุกที่ | แค่มี Internet |

---

## 📋 ขั้นตอนที่ 1: สร้าง Google Sheets

1. เปิด [Google Sheets](https://sheets.google.com/)
2. กด **"+"** (Blank spreadsheet)
3. ตั้งชื่อ เช่น `ระบบรับงานบริการแอร์`

---

## 📋 ขั้นตอนที่ 2: เปิด Apps Script

1. ใน Google Sheets ไปที่เมนู **Extensions** > **Apps Script**
2. จะเปิดหน้าต่างใหม่ (Apps Script Editor)

---

## 📋 ขั้นตอนที่ 3: เพิ่มโค้ด Backend (Code.gs)

1. ลบโค้ดเดิมในไฟล์ `Code.gs` ทิ้งทั้งหมด
2. **Copy** โค้ดจากไฟล์ `Code.gs` ที่ให้มา
3. **Paste** ลงไปใน Apps Script Editor
4. กด **Save** (รูปแบบฟลอปปี้ดิสก์) หรือ `Ctrl + S`

---

## 📋 ขั้นตอนที่ 4: เพิ่มโค้ด Frontend (index.html)

1. ใน Apps Script Editor กด **"+"** ถัดจาก "Files"
2. เลือก **HTML**
3. ตั้งชื่อว่า `index`
4. **Copy** โค้ดจากไฟล์ `index.html` ที่ให้มา
5. **Paste** ลงไป
6. กด **Save**

---

## 📋 ขั้นตอนที่ 5: รัน Setup (ครั้งแรก)

1. ใน Apps Script Editor
2. เลือกฟังก์ชัน **setup** จาก dropdown
3. กด **Run**
4. กด **Allow** เพื่อให้สิทธิ์เข้าถึง Sheets และ Drive

---

## 📋 ขั้นตอนที่ 6: Deploy เป็น Web App

1. กด **Deploy** > **New deployment**
2. กดไอคอน **⚙️** เลือก **Web app**
3. ตั้งค่า:
   - **Description**: `ระบบรับงานบริการแอร์`
   - **Execute as**: **Me**
   - **Who has access**: **Anyone**
4. กด **Deploy**
5. **คัดลอก URL** ที่ได้ (เริ่มด้วย `https://script.google.com/...`)

---

## 📋 ขั้นตอนที่ 7: ทดสอบและแชร์

### ทดสอบ:
- เปิด URL ที่ได้ใน Browser
- ลองเพิ่มงานใหม่
- ตรวจสอบข้อมูลใน Google Sheets

### แชร์ให้ทีม:
- ส่ง URL ให้ทีมใช้งานได้เลย!
- ทุกคนเห็นข้อมูลเดียวกันแบบ Real-time

---

## 🔧 การอัปเดตระบบ

เมื่อแก้ไขโค้ดแล้ว:

1. ไปที่ **Deploy** > **Manage deployments**
2. กด **✏️ Edit** (รูปดินสอ)
3. เปลี่ยน **Version** เป็น **New version**
4. กด **Deploy**

---

## 📱 ใช้งานบนมือถือ

- เปิด URL บนมือถือได้เลย
- รองรับ Responsive Design
- แนะนำ: Add to Home Screen สำหรับใช้งานสะดวกขึ้น

---

## ⚠️ ข้อจำกัด

| ข้อจำกัด | รายละเอียด |
|---------|-----------|
| การโหลดช้าหน่อย | เนื่องจากรันบน Google Server |
| รูปขนาดใหญ่ | อัปโหลดได้สูงสุด 10MB |
| ผู้ใช้พร้อมกัน | รองรับได้ดี แต่อาจช้าถ้าคนเยอะมาก |

---

## 🆘 แก้ไขปัญหา

### Error: "Authorization required"
- กด Run ฟังก์ชัน setup แล้วกด Allow

### Error: "Script function not found"
- ตรวจสอบว่าชื่อไฟล์ HTML ต้องเป็น `index` (ไม่ใช่ `index.html`)

### หน้าเว็บขาว
- ตรวจสอบ Console (F12) ดู Error
- ตรวจสอบว่า Deploy ถูกต้อง

---

## 📂 โครงสร้างไฟล์

```
Apps Script Project/
├── Code.gs        ← Backend (Google Apps Script)
└── index.html     ← Frontend (HTML + Tailwind CSS)
```

---

## 🎉 เสร็จแล้ว!

ตอนนี้คุณมีระบบรับงานบริการแอร์ที่:
- ✅ เก็บข้อมูลใน Google Sheets
- ✅ เก็บรูปใน Google Drive
- ✅ ทีมใช้งานได้พร้อมกัน
- ✅ ไม่ต้องมี Server
- ✅ ฟรี 100%!
