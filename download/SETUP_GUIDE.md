# 📖 คู่มือตั้งค่า Google Sheets + Google Drive Integration

## 🎯 ภาพรวม
ระบบจะเก็บข้อมูลงานไว้ที่ **Google Sheets** และเก็บรูปภาพไว้ที่ **Google Drive** ทำให้ทุกคนในทีมเห็นข้อมูลเดียวกันแบบ Real-time

---

## 📋 ขั้นตอนที่ 1: สร้าง Google Cloud Project

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. คลิก **"Select a project"** → **"New Project"**
3. ตั้งชื่อโปรเจกต์ เช่น `Aircon Service System`
4. คลิก **Create**

---

## 📋 ขั้นตอนที่ 2: เปิดใช้งาน Google APIs

1. ใน Google Cloud Console ไปที่ **"APIs & Services"** → **"Library"**
2. ค้นหาและเปิดใช้งาน API ต่อไปนี้:
   - ✅ **Google Sheets API**
   - ✅ **Google Drive API**

---

## 📋 ขั้นตอนที่ 3: สร้าง Service Account

1. ไปที่ **"APIs & Services"** → **"Credentials"**
2. คลิก **"+ Create Credentials"** → **"Service Account"**
3. กรอกข้อมูล:
   - **Service account name**: `aircon-service`
   - **Role**: เลือก **Editor** (หรือเจาะจงเฉพาะ Sheets/Drive)
4. คลิก **Done**
5. คลิกที่ Service Account ที่สร้างไว้
6. ไปที่แท็บ **"Keys"** → **"Add Key"** → **"Create new key"**
7. เลือก **JSON** → **Create**
8. ⚠️ **ไฟล์ JSON จะถูกดาวน์โหลด** - เก็บไว้ให้ดี!

---

## 📋 ขั้นตอนที่ 4: สร้าง Google Sheets

1. ไปที่ [Google Sheets](https://sheets.google.com/)
2. สร้าง Spreadsheet ใหม่
3. ตั้งชื่อ เช่น `Aircon Service Data`
4. สร้าง Header ในแถวแรก (A1:O1):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| id | requestNo | createdAt | channel | customerName | phone | address | serviceType | description | priority | status | appointmentDate | notes | imageUrl | history |

5. **คัดลอก Spreadsheet ID** จาก URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
   ```

---

## 📋 ขั้นตอนที่ 5: สร้าง Google Drive Folder

1. ไปที่ [Google Drive](https://drive.google.com/)
2. สร้าง Folder ใหม่ เช่น `Aircon Service Images`
3. **คัดลอก Folder ID** จาก URL:
   ```
   https://drive.google.com/drive/folders/FOLDER_ID_HERE
   ```

---

## 📋 ขั้นตอนที่ 6: แชร์ให้ Service Account

### แชร์ Google Sheets:
1. เปิด Google Sheets ที่สร้างไว้
2. คลิก **Share** (แชร์)
3. วาง **Service Account Email** จากไฟล์ JSON (`client_email`)
4. เลือกสิทธิ์ **Editor**
5. คลิก **Send**

### แชร์ Google Drive Folder:
1. เปิด Google Drive
2. คลิกขวาที่ Folder ที่สร้างไว้ → **Share**
3. วาง **Service Account Email**
4. เลือกสิทธิ์ **Editor**
5. คลิก **Send**

---

## 📋 ขั้นตอนที่ 7: ตั้งค่า Environment Variables

สร้างไฟล์ `.env.local` ในโฟลเดอร์โปรเจกต์:

```env
# Google Service Account
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"

# Google Sheets
GOOGLE_SHEETS_ID=your_spreadsheet_id_here

# Google Drive
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
```

### 📌 วิธีกรอกข้อมูล:

1. **GOOGLE_SERVICE_ACCOUNT_EMAIL**: จากไฟล์ JSON field `client_email`
2. **GOOGLE_PRIVATE_KEY**: จากไฟล์ JSON field `private_key` (รวม `\n` ทั้งหมด)
3. **GOOGLE_SHEETS_ID**: จาก URL ของ Google Sheets
4. **GOOGLE_DRIVE_FOLDER_ID**: จาก URL ของ Google Drive Folder

---

## 📋 ขั้นตอนที่ 8: รีสตาร์ทระบบ

หลังตั้งค่า `.env.local` เรียบร้อย:
1. รีสตาร์ท Development Server
2. เข้าระบบและทดสอบเพิ่มงานใหม่
3. ตรวจสอบว่าข้อมูลไปปรากฏใน Google Sheets

---

## ✅ ตรวจสอบการทำงาน

| ฟีเจอร์ | วิธีทดสอบ |
|---------|-----------|
| Google Sheets | เพิ่มงานใหม่ → เปิด Sheets ดูข้อมูล |
| Google Drive | อัปโหลดรูป → เปิด Drive ดูไฟล์ |
| Real-time Sync | เปิด 2 Browser → เพิ่มงาน → รีเฟรชอีกหน้า |

---

## ⚠️ ข้อควรระวัง

1. **ห้ามเผยแพร่ไฟล์ JSON** - มีข้อมูลสำคัญ!
2. **ห้าม Commit .env.local** - เพิ่มใน `.gitignore`
3. **Backup ข้อมูล** - Google Sheets มี Version History อัตโนมัติ

---

## 🆘 แก้ไขปัญหา

### ข้อผิดพลาด: "GOOGLE_SHEETS_ID not configured"
- ตรวจสอบว่า `.env.local` มีครบถ้วน
- รีสตาร์ท Development Server

### ข้อผิดพลาด: "Permission denied"
- ตรวจสอบว่าแชร์ Sheets/Drive ให้ Service Account แล้ว
- ตรวจสอบ Email ถูกต้อง

### รูปไม่แสดง
- ตรวจสอบว่า Drive Folder ถูกต้อง
- ลองเปิด URL รูปใน Incognito Mode

---

## 📞 ติดต่อ

หากมีปัญหา ตรวจสอบ Console ใน Developer Tools หรือดู Logs ใน Terminal
