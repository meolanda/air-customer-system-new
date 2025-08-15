# ระบบบันทึกลูกค้าแอร์ (Node.js + Vercel)

ระบบบันทึกและจัดการงานสำหรับช่างเทคนิคแอร์ ที่เชื่อมต่อกับ Google Sheets และ Google Calendar

## ✨ Features

- 📝 บันทึกงานลูกค้าใหม่ผ่าน web form
- 📊 ดูรายการงานทั้งหมดและกรองข้อมูล
- 👥 ระบบ autocomplete สำหรับลูกค้าเก่า
- 📅 ซิงค์งานที่นัดหมายไป Google Calendar อัตโนมัติ
- 🔄 อัพเดทสถานะงานแบบ real-time
- 📱 รองรับการใช้งานบนมือถือ
- 🔗 เชื่อมต่อ Google Sheets (database) และ Google Calendar

## 🚀 การติดตั้งและใช้งาน

### 1. Clone project
\`\`\`bash
git clone <repository-url>
cd ระบบบันทึกลูกค้า
\`\`\`

### 2. ติดตั้ง dependencies
\`\`\`bash
npm install
\`\`\`

### 3. ตั้งค่า Google APIs
ดูรายละเอียดใน `SETUP_GOOGLE_APIS.md`

### 4. สร้างไฟล์ .env
\`\`\`bash
cp .env.example .env
\`\`\`
แล้วแก้ไขข้อมูลใน `.env` ตามที่ได้จาก Google APIs

### 5. รันระบบ
\`\`\`bash
# Development
npm run dev

# Production (Vercel)
vercel deploy
\`\`\`

## 📱 การใช้งาน

### เพิ่มงานใหม่
- เปิด `/` หรือ `/index.html`
- กรอกข้อมูลลูกค้าและรายละเอียดงาน
- ระบบจะบันทึกไป Google Sheets และซิงค์ Calendar อัตโนมัติ

### ดูรายการงาน
- เปิด `/jobs.html`
- ดูสถิติงานและกรองข้อมูลได้
- อัพเดทสถานะงานได้

### ตรวจสอบระบบ
- เปิด `/api/health`
- ดูสถานะการทำงานของ API

## 🏗️ โครงสร้างโปรเจกต์

\`\`\`
├── api/
│   ├── index.js              # Main API server
│   └── services/
│       ├── googleSheets.js   # Google Sheets integration
│       └── googleCalendar.js # Google Calendar integration
├── public/
│   ├── index.html           # หน้าเพิ่มงานใหม่
│   └── jobs.html            # หน้าดูรายการงาน
├── package.json
├── vercel.json              # Vercel configuration
├── .env.example             # Environment variables template
└── SETUP_GOOGLE_APIS.md     # คู่มือตั้งค่า Google APIs
\`\`\`

## 🔧 API Endpoints

\`\`\`
GET  /api/health          # ตรวจสอบสถานะระบบ
GET  /api/config          # ดึงการตั้งค่า (teams, statuses)
GET  /api/customers       # ดึงรายชื่อลูกค้า (autocomplete)
GET  /api/jobs            # ดึงรายการงานทั้งหมด
POST /api/jobs            # สร้างงานใหม่
PUT  /api/jobs/:id/status # อัพเดทสถานะงาน
\`\`\`

## 📊 Google Sheets Schema

### Jobs Sheet
| Column | Description |
|--------|-------------|
| job_id | รหัสงาน (JOB-XXXXXX) |
| customer_name | ชื่อลูกค้า |
| customer_phone | เบอร์โทร |
| customer_address | ที่อยู่ |
| job_description | รายละเอียดงาน |
| status | สถานะงาน |
| team | ทีมงาน |
| scheduled_date | วันที่นัดหมาย |
| scheduled_time | เวลานัดหมาย |
| created_date | วันที่สร้าง |
| updated_date | วันที่อัพเดท |
| notes | หมายเหตุ |

### Customers Sheet
| Column | Description |
|--------|-------------|
| customer_id | รหัสลูกค้า |
| customer_name | ชื่อลูกค้า |
| aliases | ชื่อเล่น/ชื่อบริษัท |
| phone_default | เบอร์โทรหลัก |
| address_default | ที่อยู่หลัก |
| active | สถานะการใช้งาน |

## 🚀 Deployment (Vercel)

### ใช้ Vercel CLI
\`\`\`bash
npm install -g vercel
vercel login
vercel
\`\`\`

### ตั้งค่า Environment Variables ใน Vercel
ใน Vercel Dashboard:
1. เข้า Project Settings
2. ไปที่ Environment Variables
3. เพิ่มตัวแปรจาก `.env` ทั้งหมด

## 🔒 Security

- ใช้ Service Account สำหรับ Google APIs
- Environment variables สำหรับ credentials
- ไม่เก็บ sensitive data ใน code
- CORS enabled สำหรับ web browser

## 🛠️ การพัฒนาต่อ

### เพิ่ม Features ใหม่
1. เพิ่ม API endpoint ใน `api/index.js`
2. เพิ่ม functions ใน services
3. อัพเดท frontend (HTML/JS)

### การทดสอบ
\`\`\`bash
# ทดสอบ API
curl http://localhost:3000/api/health

# ทดสอบ Google Sheets connection
curl http://localhost:3000/api/customers
\`\`\`

## 📞 Support

หากมีปัญหาการใช้งาน:
1. ตรวจสอบ `.env` file
2. ดูที่ `SETUP_GOOGLE_APIS.md`
3. เช็ค logs ใน Vercel Dashboard
4. ตรวจสอบ Google APIs quotas

---

🚀 **ระบบพร้อมใช้งานแล้ว!** มาเปลี่ยนจาก Google Apps Script ที่ปวดหัวมาเป็นระบบที่ทันสมัยและใช้งานง่ายกันเถอะ!